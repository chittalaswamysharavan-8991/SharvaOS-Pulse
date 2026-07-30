export type PulseDay = { logs: unknown[]; todos: unknown[] };
export type PulseTransport = {
  owner: "d1" | "supabase";
  readDay(date: string): Promise<PulseDay>;
  mutate(date: string, operation: Record<string, unknown>, operationId?: string): Promise<PulseDay>;
  importDay(date: string, day: PulseDay, importId?: string): Promise<PulseDay>;
};

export class PulseTransportError extends Error {
  status: number;
  code?: string;
}

export function createD1PulseTransport(input?: { fetchImpl?: typeof fetch }): PulseTransport;
export function createCanonicalPulseTransport(input: { client: {
  readDay(date: string): Promise<unknown>;
  applyMutation(input: {
    date: string;
    idempotencyKey: string;
    mutation: string;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
  importDay(input: { date: string; importId: string; logs: unknown[]; todos: unknown[] }): Promise<unknown>;
} }): PulseTransport;
