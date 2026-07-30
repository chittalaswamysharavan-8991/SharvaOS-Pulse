import assert from "node:assert/strict";
import test from "node:test";

import {
  runProductionAcceptance,
  validateHealth,
  validateHome,
  validateRuntimeConfig,
} from "../scripts/verify-production-acceptance.mjs";

function response(status, body, contentType = "application/json") {
  const text = contentType === "application/json" ? JSON.stringify(body) : String(body);
  return {
    status,
    text: async () => text,
  };
}

const health = {
  status: "ready",
  version: "2.2.0",
  contract: "sharvaos.pulse.v1",
  requestedOwner: "supabase",
  dataOwner: "supabase",
  configSource: "public-default",
  canonicalFunction: "configured",
  authentication: "owner-session-required",
  sourceCommit: "af1cee26053ce4027bf87e8154473d5edcf04d2d",
};

const config = {
  requestedOwner: "supabase",
  dataOwner: "supabase",
  cutoverReady: true,
  configSource: "public-default",
  supabase: {
    projectUrl: "https://example.supabase.co",
    functionUrl: "https://example.supabase.co/functions/v1/sharvaos-pulse-sync",
    publishableKey: "sb_publishable_example_1234567890",
  },
};

const home = [
  "<h1>Sign in to your private Pulse</h1>",
  "<p>New accounts are never created from this screen.</p>",
  "<p>SUPABASE CANONICAL</p>",
].join("");

test("Phase 5 validators accept the reviewed production contract", () => {
  assert.equal(validateHealth(health).status, "ready");
  assert.equal(validateRuntimeConfig(config).dataOwner, "supabase");
  assert.equal(validateHome(home), true);
});

test("production acceptance verifies health, runtime, owner gate, and anonymous rejection", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/api/health")) return response(200, health);
    if (url.endsWith("/api/runtime-config")) return response(200, config);
    if (url === "https://pulse.example") return response(200, home, "text/html");
    return response(401, { message: "Missing authorization header" });
  };

  const evidence = await runProductionAcceptance({
    fetchImpl,
    productionUrl: "https://pulse.example/",
    writeEvidence: false,
  });

  assert.equal(evidence.result, "PASS");
  assert.equal(evidence.anonymousCanonicalMutation, "denied");
  assert.equal(calls.length, 4);
  assert.equal(calls[3].options.headers.apikey, config.supabase.publishableKey);
  assert.equal(calls[3].options.headers.authorization, undefined);
});

test("production acceptance rejects a deployment from an unexpected commit", () => {
  assert.throws(
    () => validateHealth({ ...health, sourceCommit: "wrong" }),
    /production source commit mismatch/,
  );
});

test("production acceptance rejects privileged material", () => {
  assert.throws(
    () => validateRuntimeConfig({ ...config, access_token: "forbidden" }),
    /exposed sensitive material/,
  );
});

test("production acceptance fails if the canonical function permits anonymous access", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/api/health")) return response(200, health);
    if (url.endsWith("/api/runtime-config")) return response(200, config);
    if (url === "https://pulse.example") return response(200, home, "text/html");
    return response(200, { day: { logs: [], todos: [] } });
  };

  await assert.rejects(
    () => runProductionAcceptance({
      fetchImpl,
      productionUrl: "https://pulse.example",
      writeEvidence: false,
    }),
    /accepted unauthenticated request/,
  );
});
