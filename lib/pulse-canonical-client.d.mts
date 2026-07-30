export type PulseMutation = "add_log" | "delete_log" | "add_todo" | "toggle_todo" | "delete_todo";

export type PulseCanonicalClient = {
  readDay(date: string): Promise<unknown>;
  applyMutation(input: {
    date: string;
    idempotencyKey: string;
    mutation: PulseMutation;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
  importDay(input: {
    date: string;
    importId: string;
    logs?: unknown[];
    todos?: unknown[];
  }): Promise<unknown>;
};

export function createPulseCanonicalClient(input: {
  functionUrl: string;
  accessToken?: string;
  getAccessToken?: () => string | Promise<string>;
  publishableKey?: string;
  fetchImpl?: typeof fetch;
}): PulseCanonicalClient;
