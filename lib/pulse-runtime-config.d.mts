export type PulseRuntimeConfig =
  | { requestedOwner: "d1"; dataOwner: "d1"; cutoverReady: true; supabase: null }
  | {
      requestedOwner: "supabase" | "unknown";
      dataOwner: "blocked";
      cutoverReady: false;
      reason: string;
      supabase: null;
    }
  | {
      requestedOwner: "supabase";
      dataOwner: "supabase";
      cutoverReady: true;
      supabase: { projectUrl: string; functionUrl: string; publishableKey: string };
    };

export const D1_RUNTIME_CONFIG: PulseRuntimeConfig;
export const BLOCKED_RUNTIME_CONFIG: PulseRuntimeConfig;
export function normalizePulseRuntimeConfig(value: unknown): PulseRuntimeConfig;
export function loadPulseRuntimeConfig(fetchImpl?: typeof fetch): Promise<PulseRuntimeConfig>;
