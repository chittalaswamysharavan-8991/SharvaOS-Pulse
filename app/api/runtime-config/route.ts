import { resolvePulseRuntimeValues } from "../../../lib/pulse-public-runtime.mjs";

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
  return Response.json(config, {
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
