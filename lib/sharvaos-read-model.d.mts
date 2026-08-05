export type SourceFreshness = { state: "fresh" | "aging" | "stale" | "unknown"; ageHours: number | null };
export type SharvaOSReadModel = {
  generatedAt: string;
  latestSourceAt: string | null;
  sourceFreshness: SourceFreshness;
  sourceErrors: Record<string, string>;
  mainHighlight: null | {
    title: string;
    summary?: string | null;
    status?: string | null;
    progress?: number | null;
    phase?: string | null;
    sourceName?: string | null;
    sourceUrl?: string | null;
    verifiedAt?: string | null;
  };
  nextAction: string | null;
  blocker: string | null;
  projects: Array<Record<string, any>>;
  openTasks: Array<Record<string, any>>;
  approvals: Array<Record<string, any>>;
  inbox: Array<Record<string, any>>;
  calendarEvents: Array<Record<string, any>>;
  recentEvents: Array<Record<string, any>>;
  automations: Array<Record<string, any>>;
  connectors: Array<Record<string, any> & { freshness: SourceFreshness }>;
  counts: {
    activeProjects: number;
    openTasks: number;
    pendingApprovals: number;
    inboxItems: number;
    staleConnectors: number;
  };
};

export function createSharvaOSReadModelClient(options: {
  projectUrl: string;
  publishableKey: string;
  accessToken?: string;
  getAccessToken?: () => string | Promise<string | null> | null;
  fetchImpl?: typeof fetch;
}): { readToday(): Promise<SharvaOSReadModel> };

export function classifySourceFreshness(timestamp?: string | null, now?: number): SourceFreshness;
