export const PULSE_RELEASE_VERSION = "2.2.0";
export const PULSE_CANONICAL_CONTRACT = "sharvaos.pulse.v1";

export const PUBLIC_SUPABASE_RUNTIME = Object.freeze({
  projectUrl: "https://vhzzugeeadaijkzrvowx.supabase.co",
  functionUrl: "https://vhzzugeeadaijkzrvowx.supabase.co/functions/v1/sharvaos-pulse-sync",
  publishableKey: "sb_publishable_L_bLdMqmiz9QvTVZIZ_j8A_2-nY_apM",
});

const OWNER_ENV = "SHARVAOS_PULSE_DATA_OWNER";
const URL_ENV = "SUPABASE_URL";
const KEY_ENV = "SUPABASE_PUBLISHABLE_KEY";
const FUNCTION_ENV = "SUPABASE_FUNCTION_URL";

function text(values, key) {
  const value = values?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function blocked(reason, requestedOwner = "unknown") {
  return {
    requestedOwner,
    dataOwner: "blocked",
    cutoverReady: false,
    configSource: "blocked",
    reason,
    supabase: null,
  };
}

export function resolvePulseRuntimeValues(values = {}) {
  const ownerValue = text(values, OWNER_ENV).toLowerCase();
  if (ownerValue === "d1") {
    return {
      requestedOwner: "d1",
      dataOwner: "d1",
      cutoverReady: true,
      configSource: "environment",
      supabase: null,
    };
  }
  if (ownerValue && ownerValue !== "supabase") {
    return blocked(`Runtime owner blocked: ${OWNER_ENV} must be explicitly set to d1 or supabase`);
  }

  const projectUrl = (text(values, URL_ENV) || PUBLIC_SUPABASE_RUNTIME.projectUrl).replace(/\/+$/, "");
  const publishableKey = text(values, KEY_ENV) || PUBLIC_SUPABASE_RUNTIME.publishableKey;
  const functionUrl = text(values, FUNCTION_ENV) || `${projectUrl}/functions/v1/sharvaos-pulse-sync`;
  const source = ownerValue === "supabase" || text(values, URL_ENV) || text(values, KEY_ENV) || text(values, FUNCTION_ENV)
    ? "environment"
    : "public-default";

  if (!projectUrl.startsWith("https://") || !functionUrl.startsWith("https://") || publishableKey.length < 20) {
    return blocked("Supabase cutover blocked: valid HTTPS project/function URLs and publishable key required", "supabase");
  }

  return {
    requestedOwner: "supabase",
    dataOwner: "supabase",
    cutoverReady: true,
    configSource: source,
    supabase: { projectUrl, publishableKey, functionUrl },
  };
}
