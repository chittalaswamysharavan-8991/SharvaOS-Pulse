export type SourceFreshness = {
  state: "fresh" | "aging" | "stale" | "unknown";
  ageHours: number | null;
};

export type ProjectRow = {
  id: string;
  name: string;
  summary?: string | null;
  status?: string | null;
  priority?: number | null;
  progress?: number | null;
  current_phase?: string | null;
  next_action?: string | null;
  blocker?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  last_verified_at?: string | null;
  freshness_status?: string | null;
  is_featured?: boolean | null;
  updated_at?: string | null;
};

export type TaskRow = {
  id: string;
  project_id?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: number | null;
  due_at?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  last_verified_at?: string | null;
  updated_at?: string | null;
  project_name?: string | null;
};

export type ApprovalRow = {
  id: string;
  title: string;
  decision?: string | null;
  context?: string | null;
  recommendation?: string | null;
  impact?: string | null;
  options?: unknown;
  status?: string | null;
  priority?: number | null;
  due_at?: string | null;
  requested_at?: string | null;
  resolved_at?: string | null;
  source_event_id?: string | null;
  updated_at?: string | null;
};

export type InboxRow = {
  id: string;
  title: string;
  summary?: string | null;
  category?: string | null;
  priority?: number | null;
  status?: string | null;
  source_system?: string | null;
  source_url?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SourceEventRow = {
  id: string;
  source_system?: string | null;
  external_id?: string | null;
  event_type?: string | null;
  title: string;
  summary?: string | null;
  confidence?: number | null;
  processing_status?: string | null;
  occurred_at?: string | null;
  captured_at?: string | null;
  processed_at?: string | null;
};

export type AutomationRunRow = {
  id: string;
  workflow_name?: string | null;
  status?: string | null;
  trigger_type?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  rows_read?: number | null;
  rows_written?: number | null;
  rows_skipped?: number | null;
  error_message?: string | null;
  evidence?: unknown;
  created_at?: string | null;
};

export type ConnectorRow = {
  id: string;
  name: string;
  category?: string | null;
  status?: string | null;
  last_checked_at?: string | null;
  last_success_at?: string | null;
  latency_ms?: number | null;
  error_summary?: string | null;
  details?: unknown;
  updated_at?: string | null;
  freshness: SourceFreshness;
};

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
  projects: ProjectRow[];
  openTasks: TaskRow[];
  approvals: ApprovalRow[];
  inbox: InboxRow[];
  calendarEvents: SourceEventRow[];
  recentEvents: SourceEventRow[];
  automations: AutomationRunRow[];
  connectors: ConnectorRow[];
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
