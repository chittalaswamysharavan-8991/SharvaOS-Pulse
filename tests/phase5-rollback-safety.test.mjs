import assert from "node:assert/strict";
import test from "node:test";

import { resolvePulseRuntimeValues } from "../lib/pulse-public-runtime.mjs";

const d1Binding = {
  prepare() {
    throw new Error("test binding should not be queried");
  },
};

test("D1 rollback fails closed when the Cloudflare binding is unavailable", () => {
  const runtime = resolvePulseRuntimeValues({ SHARVAOS_PULSE_DATA_OWNER: "d1" });
  assert.equal(runtime.requestedOwner, "d1");
  assert.equal(runtime.dataOwner, "blocked");
  assert.equal(runtime.cutoverReady, false);
  assert.match(runtime.reason, /D1 binding `DB` is unavailable/);
});

test("D1 rollback is ready only with a real binding-shaped runtime object", () => {
  const runtime = resolvePulseRuntimeValues({
    SHARVAOS_PULSE_DATA_OWNER: "d1",
    DB: d1Binding,
  });
  assert.equal(runtime.requestedOwner, "d1");
  assert.equal(runtime.dataOwner, "d1");
  assert.equal(runtime.cutoverReady, true);
  assert.equal(runtime.configSource, "environment");
  assert.equal(runtime.supabase, null);
});

test("forward recovery restores the Supabase canonical owner on the same release", () => {
  const rollback = resolvePulseRuntimeValues({
    SHARVAOS_PULSE_DATA_OWNER: "d1",
    DB: d1Binding,
  });
  const recovered = resolvePulseRuntimeValues({ SHARVAOS_PULSE_DATA_OWNER: "supabase" });

  assert.equal(rollback.dataOwner, "d1");
  assert.equal(recovered.requestedOwner, "supabase");
  assert.equal(recovered.dataOwner, "supabase");
  assert.equal(recovered.cutoverReady, true);
  assert.equal(recovered.supabase.projectUrl, "https://vhzzugeeadaijkzrvowx.supabase.co");
});

test("an invalid owner value remains blocked", () => {
  const runtime = resolvePulseRuntimeValues({ SHARVAOS_PULSE_DATA_OWNER: "both" });
  assert.equal(runtime.dataOwner, "blocked");
  assert.equal(runtime.cutoverReady, false);
  assert.match(runtime.reason, /must be explicitly set to d1 or supabase/);
});
