import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPulseAuthClient } from "../lib/pulse-auth-client.mjs";
import { createPulseCanonicalClient } from "../lib/pulse-canonical-client.mjs";
import { normalizePulseRuntimeConfig } from "../lib/pulse-runtime-config.mjs";
import {
  createCanonicalPulseTransport,
  createD1PulseTransport,
  selectMissingDayEntries,
} from "../lib/pulse-transport.mjs";

function response(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

test("email OTP auth never creates users and stores only the returned owner session", async () => {
  const calls = [];
  const storage = memoryStorage();
  const auth = createPulseAuthClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test_key_123456789",
    storage,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/auth/v1/otp")) return response(200);
      return response(200, {
        access_token: "owner-access",
        refresh_token: "owner-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
    },
  });

  await auth.requestOtp(" Owner@Example.com ");
  const session = await auth.verifyOtp({ email: "owner@example.com", token: "123456" });
  assert.equal(JSON.parse(calls[0].options.body).create_user, false);
  assert.equal(JSON.parse(calls[0].options.body).email, "owner@example.com");
  assert.equal(JSON.parse(calls[1].options.body).type, "email");
  assert.equal(session.access_token, "owner-access");
  assert.match(storage.values.get("sharvaos-pulse-auth:v1"), /owner-refresh/);
});

test("expired sessions refresh before canonical requests and dynamic JWTs are used", async () => {
  const storage = memoryStorage();
  storage.setItem("sharvaos-pulse-auth:v1", JSON.stringify({
    access_token: "expired-access",
    refresh_token: "refresh-me",
    expires_at: 1,
  }));
  const authCalls = [];
  const auth = createPulseAuthClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test_key_123456789",
    storage,
    fetchImpl: async (url, options) => {
      authCalls.push({ url, options });
      return response(200, {
        access_token: "fresh-access",
        refresh_token: "fresh-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
    },
  });
  const canonicalCalls = [];
  const client = createPulseCanonicalClient({
    functionUrl: "https://example.supabase.co/functions/v1/sharvaos-pulse-sync",
    publishableKey: "sb_publishable_test_key_123456789",
    getAccessToken: () => auth.getAccessToken(),
    fetchImpl: async (url, options) => {
      canonicalCalls.push({ url, options });
      return response(200, { day: { logs: [], todos: [] } });
    },
  });

  await client.readDay("2026-07-30");
  assert.match(authCalls[0].url, /grant_type=refresh_token/);
  assert.equal(canonicalCalls[0].options.headers.authorization, "Bearer fresh-access");
  assert.equal(canonicalCalls[0].options.headers.apikey, "sb_publishable_test_key_123456789");
});

test("runtime configuration fails closed to D1 and enables Supabase only when complete", () => {
  assert.equal(normalizePulseRuntimeConfig({ requestedOwner: "supabase" }).dataOwner, "d1");
  const ready = normalizePulseRuntimeConfig({
    requestedOwner: "supabase",
    dataOwner: "supabase",
    cutoverReady: true,
    supabase: {
      projectUrl: "https://example.supabase.co/",
      functionUrl: "https://example.supabase.co/functions/v1/sharvaos-pulse-sync",
      publishableKey: "sb_publishable_test_key_123456789",
    },
  });
  assert.equal(ready.dataOwner, "supabase");
  assert.equal(ready.supabase.projectUrl, "https://example.supabase.co");
});

test("canonical transport binds every queued mutation to its stable queue identity", async () => {
  const calls = [];
  const client = {
    readDay: async () => ({ day: { logs: [], todos: [] } }),
    importDay: async () => ({ day: { logs: [], todos: [] } }),
    applyMutation: async (input) => {
      calls.push(input);
      return { day: { logs: [], todos: [] } };
    },
  };
  const transport = createCanonicalPulseTransport({ client });
  await transport.mutate("2026-07-30", { action: "toggle_todo", id: "task-1", done: true }, "queue-toggle-0001");
  await transport.mutate("2026-07-30", { action: "toggle_todo", id: "task-1", done: false }, "queue-toggle-0002");
  assert.equal(calls[0].idempotencyKey, "device:queue-toggle-0001");
  assert.equal(calls[1].idempotencyKey, "device:queue-toggle-0002");
  assert.deepEqual(calls[0].payload, { id: "task-1", done: true });
  assert.notEqual(calls[0].idempotencyKey, calls[1].idempotencyKey);
});

test("partial canonical days import only missing device entries", () => {
  const local = {
    logs: [
      { id: "water-1", kind: "water", label: "250 ml water", detail: "Hydration", amount: 250, loggedAt: 1000 },
      { id: "food-copy", kind: "food", label: "Rice", detail: "Lunch", amount: null, loggedAt: 2000 },
      { id: "smoke-new", kind: "smoke", label: "Smoke", detail: "Entry 1 today", amount: null, loggedAt: 3000 },
    ],
    todos: [
      { id: "task-copy", text: "Already canonical", done: true, createdAt: 4000 },
      { id: "task-new", text: "Missing local task", done: false, createdAt: 5000 },
    ],
  };
  const remote = {
    logs: [
      { id: "water-1", kind: "water", label: "250 ml water", detail: "Hydration", amount: 250, loggedAt: 1000 },
      { id: "food-remote", kind: "food", label: "Rice", detail: "Lunch", amount: null, loggedAt: 2000 },
    ],
    todos: [
      { id: "task-remote", text: "Already canonical", done: false, createdAt: 4000 },
    ],
  };

  const missing = selectMissingDayEntries(local, remote);
  assert.deepEqual(missing.logs.map((entry) => entry.id), ["smoke-new"]);
  assert.deepEqual(missing.todos.map((entry) => entry.id), ["task-new"]);
});

test("canonical imports are batched without truncation and keep unique bounded IDs", async () => {
  const calls = [];
  const client = {
    readDay: async () => ({ day: { logs: [], todos: [] } }),
    applyMutation: async () => ({ day: { logs: [], todos: [] } }),
    importDay: async (input) => {
      calls.push(input);
      return { day: { logs: input.logs, todos: input.todos } };
    },
  };
  const transport = createCanonicalPulseTransport({ client });
  const logs = Array.from({ length: 205 }, (_, index) => ({ id: `log-${index}` }));
  const todos = Array.from({ length: 101 }, (_, index) => ({ id: `todo-${index}` }));
  await transport.importDay("2026-07-30", { logs, todos }, "x".repeat(80));

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.logs.length), [100, 100, 5]);
  assert.deepEqual(calls.map((call) => call.todos.length), [100, 1, 0]);
  assert.equal(new Set(calls.map((call) => call.importId)).size, 3);
  assert.ok(calls.every((call) => call.importId.length <= 80));
});

test("D1 transport remains an explicit one-variable rollback path", async () => {
  const calls = [];
  const transport = createD1PulseTransport({
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      return response(200, { logs: [], todos: [] });
    },
  });
  await transport.readDay("2026-07-30");
  await transport.mutate("2026-07-30", { action: "add_todo", id: "x", text: "Test", createdAt: 1 });
  assert.equal(transport.owner, "d1");
  assert.equal(calls[0].url, "/api/day?date=2026-07-30");
  assert.equal(JSON.parse(calls[1].options.body).date, "2026-07-30");
});

test("Phase 3 source exposes only publishable runtime config and contains no live key or service role", async () => {
  const files = await Promise.all([
    readFile(new URL("../app/api/runtime-config/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/pulse-auth-client.mjs", import.meta.url), "utf8"),
  ]);
  const source = files.join("\n");
  assert.match(source, /SHARVAOS_PULSE_DATA_OWNER/);
  assert.match(source, /SUPABASE_PUBLISHABLE_KEY/);
  assert.match(source, /create_user:\s*false/);
  assert.doesNotMatch(source, /SERVICE_ROLE|service_role/i);
  assert.doesNotMatch(source, /sb_publishable_L_bLdMqmiz9QvTVZIZ_j8A_2-nY_apM/);
});
