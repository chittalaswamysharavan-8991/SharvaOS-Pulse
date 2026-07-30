import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPulseCanonicalClient } from "../lib/pulse-canonical-client.mjs";

const migrationPath = new URL("../supabase/migrations/20260730082500_canonical_pulse_v1.sql", import.meta.url);
const envelopeMigrationPath = new URL("../supabase/migrations/20260730091500_bind_receipt_hash_to_mutation_envelope.sql", import.meta.url);
const functionPath = new URL("../supabase/functions/sharvaos-pulse-sync/index.ts", import.meta.url);

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("canonical migration freezes owner-scoped tables, RLS, receipts, and compatibility mirrors", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const expected of [
    "create table if not exists public.pulse_logs",
    "create table if not exists public.pulse_todos",
    "create table if not exists public.pulse_mutation_receipts",
    "alter table public.pulse_logs enable row level security",
    "using ((select auth.uid()) = owner_id)",
    "pulse_apply_mutation",
    "pulse_mirror_legacy_water_insert_trigger",
    "pulse_mirror_legacy_water_void_trigger",
    "legacy_out_of_range",
  ]) assert.match(sql, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(sql, /drop table\s+public\.sharva_water_logs/i);
});

test("idempotency receipts bind date, action, and payload rather than payload alone", async () => {
  const sql = await readFile(envelopeMigrationPath, "utf8");
  assert.match(sql, /jsonb_build_object\('date', p_date, 'action', p_action, 'payload', p_payload\)/);
  assert.match(sql, /Mutation-envelope hash migration requires an empty receipt table/);
  assert.match(sql, /Mutation-envelope hash replacement could not be verified/);
});

test("canonical Edge Function requires a bearer session and forwards authenticated RPC calls", async () => {
  const source = await readFile(functionPath, "utf8");
  assert.match(source, /Authorization/);
  assert.match(source, /auth\.getUser/);
  assert.match(source, /pulse_read_day/);
  assert.match(source, /pulse_apply_mutation/);
  assert.match(source, /sharvaos\.pulse\.v1/);
  assert.doesNotMatch(source, /SERVICE_ROLE/);
});

test("client emits the exact authenticated read and mutation envelopes", async () => {
  const calls = [];
  const client = createPulseCanonicalClient({
    functionUrl: "https://example.supabase.co/functions/v1/sharvaos-pulse-sync",
    accessToken: "user-jwt",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(200, { status: "saved" });
    },
  });

  await client.readDay("2026-07-30");
  await client.applyMutation({
    date: "2026-07-30",
    idempotencyKey: "device:add-log:123",
    mutation: "add_log",
    payload: { id: "00000000-0000-4000-8000-000000000001" },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.authorization, "Bearer user-jwt");
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: "read_day", date: "2026-07-30" });
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    action: "apply_mutation",
    date: "2026-07-30",
    idempotency_key: "device:add-log:123",
    mutation: "add_log",
    payload: { id: "00000000-0000-4000-8000-000000000001" },
  });
});

test("client rejects insecure endpoints, invalid mutations, and canonical errors", async () => {
  assert.throws(() => createPulseCanonicalClient({ functionUrl: "http://example.test", accessToken: "jwt" }), /HTTPS/);
  const client = createPulseCanonicalClient({
    functionUrl: "https://example.test/sync",
    accessToken: "jwt",
    fetchImpl: async () => response(409, { message: "Idempotency conflict", code: "23505" }),
  });
  await assert.rejects(
    client.applyMutation({ date: "2026-07-30", idempotencyKey: "valid-key", mutation: "unknown", payload: {} }),
    /Unsupported mutation/,
  );
  await assert.rejects(client.readDay("bad-date"), /Valid date/);
  await assert.rejects(
    client.applyMutation({ date: "2026-07-30", idempotencyKey: "valid-key", mutation: "add_log", payload: {} }),
    (error) => error.status === 409 && error.code === "23505",
  );
});
