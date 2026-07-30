export const PULSE_RELEASE_VERSION: "2.2.0";
export const PULSE_CANONICAL_CONTRACT: "sharvaos.pulse.v1";
export const PUBLIC_SUPABASE_RUNTIME: Readonly<{
  projectUrl: string;
  functionUrl: string;
  publishableKey: string;
}>;

export type PulseResolvedRuntime = {
  requestedOwner: "d1" | "supabase" | "unknown";
  dataOwner: "d1" | "supabase" | "blocked";
  cutoverReady: boolean;
  configSource: "environment" | "public-default" | "blocked";
  reason?: string;
  supabase: null | {
    projectUrl: string;
    functionUrl: string;
    publishableKey: string;
  };
};

export function resolvePulseRuntimeValues(values?: Record<string, unknown>): PulseResolvedRuntime;
