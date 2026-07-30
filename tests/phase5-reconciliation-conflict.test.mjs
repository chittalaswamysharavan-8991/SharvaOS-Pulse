import assert from "node:assert/strict";
import test from "node:test";
import { createInitialImportId, reconcileMissingDay } from "../lib/pulse-transport.mjs";

const date = "2026-07-30";
const base = { logs: [{ id: "11111111-1111-4111-8111-111111111111", kind: "water", label: "250 ml water", detail: "Hydration", amount: 250, loggedAt: 1785431984900 }], todos: [] };

test("initial import IDs are stable for the same payload and change with payload", () => {
  const first = createInitialImportId(date, base);
  const replay = createInitialImportId(date, structuredClone(base));
  const changed = createInitialImportId(date, { ...base, logs: [{ ...base.logs[0], amount: 500, label: "500 ml water" }] });
  assert.equal(first, replay);
  assert.notEqual(first, changed);
  assert.ok(first.length <= 80);
});

test("canonical 409 keeps a fresh authoritative day", async () => {
  const canonical = { logs: [], todos: [] };
  const transport = {
    owner: "supabase",
    async importDay() { const error = new Error("conflict"); error.status = 409; throw error; },
    async readDay() { return canonical; },
  };
  const result = await reconcileMissingDay({ transport, date, missing: base });
  assert.equal(result.conflict, true);
  assert.deepEqual(result.day, canonical);
});

test("non-conflict import failures still propagate", async () => {
  const transport = {
    owner: "supabase",
    async importDay() { const error = new Error("offline"); error.status = 503; throw error; },
    async readDay() { throw new Error("should not read"); },
  };
  await assert.rejects(() => reconcileMissingDay({ transport, date, missing: base }), /offline/);
});
