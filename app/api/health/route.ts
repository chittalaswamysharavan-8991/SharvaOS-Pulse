import {
  PULSE_CANONICAL_CONTRACT,
  PULSE_RELEASE_VERSION,
  resolvePulseRuntimeValues,
} from "../../../lib/pulse-public-runtime.mjs";

export const runtime = "edge";

type RuntimeValues = Record<string, unknown>;

async function readRuntimeValues() {
  const nodeValues: RuntimeValues = typeof process === "undefined" ? {} : process.env;
  let workerValues: RuntimeValues = {};
  try {
    const workers = await import("cloudflare:workers");
    workerValues = workers.env as unknown as RuntimeValues;
  } catch {}
  return { ...nodeValues, ...workerValues };
}

export async function GET() {
  const config = resolvePulseRuntimeValues(await readRuntimeValues());
  const ready = config.cutoverReady && config.dataOwner !== "blocked";
  const authentication = config.dataOwner === "supabase"
    ? "owner-session-required"
    : config.dataOwner === "d1"
      ? "platform-identity"
      : "blocked";
  return Response.json({
    status: ready ? "ready" : "blocked",
    version: PULSE_RELEASE_VERSION,
    contract: PULSE_CANONICAL_CONTRACT,
    requestedOwner: config.requestedOwner,
    dataOwner: config.dataOwner,
    configSource: config.configSource,
    canonicalFunction: config.supabase ? "configured" : "not-configured",
    authentication,
    rollback: "D1 rollback requires SHARVAOS_PULSE_DATA_OWNER=d1 and a live Cloudflare DB binding on the same release",
    reason: config.reason ?? null,
  }, {
    status: ready ? 200 : 503,
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
