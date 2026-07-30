export const runtime = "edge";

const OWNER_ENV = "SHARVAOS_PULSE_DATA_OWNER";
const URL_ENV = "SUPABASE_URL";
const KEY_ENV = "SUPABASE_PUBLISHABLE_KEY";
const FUNCTION_ENV = "SUPABASE_FUNCTION_URL";

type RuntimeValues = Record<string, unknown>;

function text(values: RuntimeValues, key: string) {
  const value = values[key];
  return typeof value === "string" ? value.trim() : "";
}

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
  const values = await readRuntimeValues();
  const requestedOwner = text(values, OWNER_ENV).toLowerCase() === "supabase" ? "supabase" : "d1";
  if (requestedOwner === "d1") {
    return Response.json({
      requestedOwner: "d1",
      dataOwner: "d1",
      cutoverReady: true,
      supabase: null,
    }, { headers: { "cache-control": "no-store, max-age=0" } });
  }

  const projectUrl = text(values, URL_ENV).replace(/\/+$/, "");
  const publishableKey = text(values, KEY_ENV);
  const functionUrl = text(values, FUNCTION_ENV) || (projectUrl ? `${projectUrl}/functions/v1/sharvaos-pulse-sync` : "");
  const missing = [
    [URL_ENV, projectUrl],
    [KEY_ENV, publishableKey],
    [FUNCTION_ENV, functionUrl],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length || !projectUrl.startsWith("https://") || !functionUrl.startsWith("https://")) {
    return Response.json({
      requestedOwner: "supabase",
      dataOwner: "blocked",
      cutoverReady: false,
      reason: `Supabase cutover blocked: ${missing.length ? `missing ${missing.join(", ")}` : "HTTPS configuration required"}`,
      supabase: null,
    }, { headers: { "cache-control": "no-store, max-age=0" } });
  }

  return Response.json({
    requestedOwner: "supabase",
    dataOwner: "supabase",
    cutoverReady: true,
    supabase: { projectUrl, publishableKey, functionUrl },
  }, { headers: { "cache-control": "no-store, max-age=0" } });
}
