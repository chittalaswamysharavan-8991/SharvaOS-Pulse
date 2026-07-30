import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPulseAuthClient, PulseAuthError } from "../lib/pulse-auth-client.mjs";

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

test("Google OAuth authorize URL uses the reviewed Supabase callback flow", () => {
  const auth = createPulseAuthClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test_key_123456789",
    storage: memoryStorage(),
    fetchImpl: async () => response(200),
    location: { origin: "https://pulse.example", href: "https://pulse.example/", assign() {} },
    history: { replaceState() {} },
  });
  const url = new URL(auth.getGoogleAuthorizeUrl({ redirectTo: "https://pulse.example" }));
  assert.equal(url.pathname, "/auth/v1/authorize");
  assert.equal(url.searchParams.get("provider"), "google");
  assert.equal(url.searchParams.get("redirect_to"), "https://pulse.example");
});

test("Google OAuth callback validates and persists the returned Supabase owner session", async () => {
  const storage = memoryStorage();
  const replaced = [];
  const calls = [];
  const auth = createPulseAuthClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test_key_123456789",
    storage,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(200, { id: "owner-user" });
    },
    location: { origin: "https://pulse.example", href: "https://pulse.example/", assign() {} },
    history: { replaceState: (...args) => replaced.push(args) },
  });
  const session = await auth.captureOAuthSession("https://pulse.example/#access_token=google-access&refresh_token=google-refresh&expires_in=3600&token_type=bearer");
  assert.equal(session.access_token, "google-access");
  assert.match(storage.values.get("sharvaos-pulse-auth:v1"), /google-refresh/);
  assert.match(calls[0].url, /\/auth\/v1\/user$/);
  assert.equal(calls[0].options.headers.authorization, "Bearer google-access");
  assert.equal(replaced.length, 1);
});

test("OAuth callback errors do not create a local session", async () => {
  const storage = memoryStorage();
  const auth = createPulseAuthClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test_key_123456789",
    storage,
    fetchImpl: async () => response(200),
    location: { origin: "https://pulse.example", href: "https://pulse.example/", assign() {} },
    history: { replaceState() {} },
  });
  await assert.rejects(
    () => auth.captureOAuthSession("https://pulse.example/#error=access_denied&error_description=Owner%20cancelled"),
    (error) => error instanceof PulseAuthError && error.code === "OAUTH_ERROR",
  );
  assert.equal(storage.values.size, 0);
});

test("Google provider availability is read from public Supabase Auth settings", async () => {
  const auth = createPulseAuthClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test_key_123456789",
    storage: memoryStorage(),
    fetchImpl: async () => response(200, { external: { google: true } }),
  });
  assert.equal(await auth.isGoogleEnabled(), true);
});

test("owner-only migration blocks new users and non-owner canonical access", async () => {
  const [migration, config, page] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260730153000_google_owner_only_auth.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/config.toml", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /private\.pulse_owner_registry/);
  assert.match(migration, /v_count <> 1/);
  assert.match(migration, /as restrictive for select to authenticated/);
  assert.match(migration, /Registered Pulse owner required/);
  assert.match(migration, /hook_reject_new_pulse_users/);
  assert.match(migration, /to supabase_auth_admin/);
  assert.match(config, /\[auth\.external\.google\]/);
  assert.match(config, /SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET/);
  assert.match(config, /\[auth\.hook\.before_user_created\]/);
  assert.match(page, /Continue with Google/);
  assert.match(page, /Use email code recovery/);
  assert.doesNotMatch([migration, config, page].join("\n"), /client_secret\s*=\s*["'][^e]/i);
});
