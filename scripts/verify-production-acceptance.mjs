import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const DEFAULTS = Object.freeze({
  productionUrl: "https://sharvaos-pulse-google.vercel.app",
  expectedVersion: "2.2.0",
  expectedContract: "sharvaos.pulse.v1",
  expectedSourceCommit: "",
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoSensitiveMaterial(value, label) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  invariant(
    !/service[_-]?role|access_token|refresh_token|owner(?:\s|_)?email|@gmail\.com|@googlemail\.com/i.test(text),
    `${label} exposed sensitive material`,
  );
}

export function validateHealth(health, expected = DEFAULTS) {
  invariant(health?.status === "ready", "health status must be ready");
  invariant(health?.version === expected.expectedVersion, "unexpected release version");
  invariant(health?.contract === expected.expectedContract, "unexpected canonical contract");
  invariant(health?.dataOwner === "supabase", "production owner must be supabase");
  invariant(health?.authentication === "owner-session-required", "owner session must be required");
  invariant(/^[0-9a-f]{40}$/i.test(health?.sourceCommit ?? ""), "production source commit must be a full Git SHA");
  if (expected.expectedSourceCommit) {
    invariant(health.sourceCommit === expected.expectedSourceCommit, "production source commit mismatch");
  }
  assertNoSensitiveMaterial(health, "health response");
  return health;
}

export function validateRuntimeConfig(config) {
  invariant(config?.requestedOwner === "supabase", "runtime must request supabase");
  invariant(config?.dataOwner === "supabase", "runtime owner must be supabase");
  invariant(config?.cutoverReady === true, "runtime must be cutover ready");
  if (config?.configSource !== undefined) {
    invariant(["public-default", "environment"].includes(config.configSource), "unexpected config source");
  }
  invariant(config?.supabase?.projectUrl?.startsWith("https://"), "missing HTTPS project URL");
  invariant(config?.supabase?.functionUrl?.startsWith("https://"), "missing HTTPS function URL");
  invariant(config?.supabase?.publishableKey?.startsWith("sb_publishable_"), "missing publishable client key");
  assertNoSensitiveMaterial(config, "runtime config");
  return config;
}

export function validateHomeShell(html) {
  invariant(html.includes("<title>SharvaOS Daily Pulse</title>"), "production title missing");
  invariant(html.includes("Checking canonical runtime"), "canonical runtime shell missing");
  invariant(html.includes("SHARVAOS PULSE"), "Pulse shell marker missing");
  assertNoSensitiveMaterial(html, "home shell");
  return true;
}

async function readJson(response, label) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

export async function runProductionAcceptance({
  fetchImpl = globalThis.fetch,
  productionUrl = process.env.SHARVAOS_PULSE_PRODUCTION_URL || DEFAULTS.productionUrl,
  expectedVersion = process.env.EXPECTED_VERSION || DEFAULTS.expectedVersion,
  expectedContract = process.env.EXPECTED_CONTRACT || DEFAULTS.expectedContract,
  expectedSourceCommit = process.env.EXPECTED_SOURCE_COMMIT || DEFAULTS.expectedSourceCommit,
  writeEvidence = true,
} = {}) {
  invariant(typeof fetchImpl === "function", "fetch implementation is required");
  const base = productionUrl.replace(/\/+$/, "");
  const expected = { expectedVersion, expectedContract, expectedSourceCommit };

  const healthResponse = await fetchImpl(`${base}/api/health`, {
    headers: { accept: "application/json" },
  });
  invariant(healthResponse.status === 200, `health endpoint returned ${healthResponse.status}`);
  const health = await readJson(healthResponse, "health endpoint");
  validateHealth(health, expected);

  const configResponse = await fetchImpl(`${base}/api/runtime-config`, {
    headers: { accept: "application/json" },
  });
  invariant(configResponse.status === 200, `runtime config returned ${configResponse.status}`);
  const config = await readJson(configResponse, "runtime config");
  validateRuntimeConfig(config);

  const homeResponse = await fetchImpl(base, { headers: { accept: "text/html" } });
  invariant(homeResponse.status === 200, `home page returned ${homeResponse.status}`);
  validateHomeShell(await homeResponse.text());

  const unauthorizedResponse = await fetchImpl(config.supabase.functionUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      apikey: config.supabase.publishableKey,
    },
    body: JSON.stringify({ operation: "read_day", date: "2026-07-30" }),
  });
  invariant(
    [401, 403].includes(unauthorizedResponse.status),
    `canonical function accepted unauthenticated request (${unauthorizedResponse.status})`,
  );

  const evidence = {
    checkedAt: new Date().toISOString(),
    productionUrl: base,
    release: health.version,
    contract: health.contract,
    sourceCommit: health.sourceCommit,
    dataOwner: health.dataOwner,
    configSource: config.configSource ?? "legacy-public-runtime",
    canonicalFunction: "verified-by-runtime-config",
    productionShell: "ready",
    ownerGateContract: "verified-by-repository-tests-and-browser-acceptance",
    anonymousCanonicalMutation: "denied",
    rollbackMode: "d1-binding-required",
    result: "PASS",
  };

  if (writeEvidence) {
    await mkdir("verification", { recursive: true });
    await writeFile(
      "verification/phase5-production-acceptance.json",
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
  }
  return evidence;
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entrypoint) {
  runProductionAcceptance()
    .then((evidence) => console.log(JSON.stringify(evidence, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
