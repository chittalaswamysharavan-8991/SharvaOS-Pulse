import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PULSE_CANONICAL_CONTRACT,
  PULSE_RELEASE_VERSION,
  PUBLIC_SUPABASE_RUNTIME,
  resolvePulseRuntimeValues,
} from "../lib/pulse-public-runtime.mjs";

const d1Binding = { prepare() {} };

test("Phase 4 defaults to the Supabase canonical owner without private secrets", () => {
  const config = resolvePulseRuntimeValues({});
  assert.equal(config.requestedOwner, "supabase");
  assert.equal(config.dataOwner, "supabase");
  assert.equal(config.cutoverReady, true);
  assert.equal(config.configSource, "public-default");
  assert.deepEqual(config.supabase, PUBLIC_SUPABASE_RUNTIME);
});

test("Phase 4 rollback requires an explicit D1 owner and live binding", () => {
  const blocked = resolvePulseRuntimeValues({ SHARVAOS_PULSE_DATA_OWNER: "d1" });
  assert.equal(blocked.requestedOwner, "d1");
  assert.equal(blocked.dataOwner, "blocked");
  assert.equal(blocked.cutoverReady, false);
  assert.match(blocked.reason, /D1 binding `DB` is unavailable/);

  const ready = resolvePulseRuntimeValues({
    SHARVAOS_PULSE_DATA_OWNER: "d1",
    DB: d1Binding,
  });
  assert.equal(ready.requestedOwner, "d1");
  assert.equal(ready.dataOwner, "d1");
  assert.equal(ready.cutoverReady, true);
  assert.equal(ready.configSource, "environment");
  assert.equal(ready.supabase, null);
});

test("invalid explicit runtime owners fail closed", () => {
  const config = resolvePulseRuntimeValues({ SHARVAOS_PULSE_DATA_OWNER: "auto" });
  assert.equal(config.dataOwner, "blocked");
  assert.equal(config.cutoverReady, false);
  assert.match(config.reason, /must be explicitly set to d1 or supabase/);
});

test("reviewed environment values can override public publishable coordinates", () => {
  const config = resolvePulseRuntimeValues({
    SHARVAOS_PULSE_DATA_OWNER: "supabase",
    SUPABASE_URL: "https://example.supabase.co/",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_reviewed_override_123456",
    SUPABASE_FUNCTION_URL: "https://example.supabase.co/functions/v1/pulse",
  });
  assert.equal(config.dataOwner, "supabase");
  assert.equal(config.configSource, "environment");
  assert.equal(config.supabase.projectUrl, "https://example.supabase.co");
  assert.equal(config.supabase.functionUrl, "https://example.supabase.co/functions/v1/pulse");
});

test("malformed reviewed Supabase values fail closed", () => {
  const config = resolvePulseRuntimeValues({
    SHARVAOS_PULSE_DATA_OWNER: "supabase",
    SUPABASE_URL: "http://insecure.example",
    SUPABASE_PUBLISHABLE_KEY: "short",
    SUPABASE_FUNCTION_URL: "http://insecure.example/function",
  });
  assert.equal(config.dataOwner, "blocked");
  assert.equal(config.cutoverReady, false);
});

test("release identifiers are frozen for the production activation packet", () => {
  assert.equal(PULSE_RELEASE_VERSION, "2.2.0");
  assert.equal(PULSE_CANONICAL_CONTRACT, "sharvaos.pulse.v1");
});

test("checked-in runtime material contains no privileged key or owner identity", async () => {
  const source = await readFile(new URL("../lib/pulse-public-runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /sb_publishable_/);
  assert.doesNotMatch(source, /service[_-]?role/i);
  assert.doesNotMatch(source, /@gmail\.com|@googlemail\.com/i);
  assert.doesNotMatch(source, /eyJ[a-zA-Z0-9_-]{20,}\./);
});

test("health endpoint reports safe operational metadata only", async () => {
  const source = await readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  assert.match(source, /owner-session-required/);
  assert.match(source, /SHARVAOS_PULSE_DATA_OWNER=d1/);
  assert.match(source, /live Cloudflare DB binding/);
  assert.doesNotMatch(source, /publishableKey|access_token|refresh_token|owner email/i);
});
