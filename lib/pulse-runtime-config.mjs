export const D1_RUNTIME_CONFIG = Object.freeze({
  requestedOwner: "d1",
  dataOwner: "d1",
  cutoverReady: true,
  supabase: null,
});

function https(value) {
  return typeof value === "string" && value.startsWith("https://") && value.length > 10;
}

export function normalizePulseRuntimeConfig(value) {
  if (!value || typeof value !== "object") return D1_RUNTIME_CONFIG;
  const requestedOwner = value.requestedOwner === "supabase" ? "supabase" : "d1";
  if (requestedOwner === "d1") return D1_RUNTIME_CONFIG;
  const supabase = value.supabase;
  const ready = Boolean(
    value.cutoverReady === true &&
    supabase && typeof supabase === "object" &&
    https(supabase.projectUrl) &&
    https(supabase.functionUrl) &&
    typeof supabase.publishableKey === "string" &&
    supabase.publishableKey.length >= 20,
  );
  if (!ready) {
    return {
      requestedOwner: "supabase",
      dataOwner: "d1",
      cutoverReady: false,
      reason: typeof value.reason === "string" ? value.reason : "Supabase runtime configuration is incomplete",
      supabase: null,
    };
  }
  return {
    requestedOwner: "supabase",
    dataOwner: "supabase",
    cutoverReady: true,
    supabase: {
      projectUrl: supabase.projectUrl.replace(/\/+$/, ""),
      functionUrl: supabase.functionUrl,
      publishableKey: supabase.publishableKey,
    },
  };
}

export async function loadPulseRuntimeConfig(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const response = await fetchImpl("/api/runtime-config", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Runtime configuration unavailable");
  return normalizePulseRuntimeConfig(payload);
}
