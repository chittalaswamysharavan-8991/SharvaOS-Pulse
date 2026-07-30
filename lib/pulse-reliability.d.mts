export type LogKind = "water" | "smoke" | "food";

export type LogEntry = {
  id: string;
  kind: LogKind;
  label: string;
  detail: string;
  amount: number | null;
  loggedAt: number;
};

export type TodoEntry = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
};

export type DayState = {
  logs: LogEntry[];
  todos: TodoEntry[];
};

export type MutationBody = Record<string, unknown> & { action?: string };

export type PendingOperation = {
  queueId: string;
  body: MutationBody;
  createdAt?: number;
};

export function cleanText(value: unknown, max?: number): string;
export function isValidWaterAmount(value: unknown): value is number;
export function normalizeImportedLog(raw: unknown): LogEntry | null;
export function normalizeImportedTodo(raw: unknown): TodoEntry | null;
export function normalizeDay(value: unknown): DayState;
export function applyOperation(day: unknown, body: MutationBody): DayState;
export function applyPendingOperations(day: unknown, operations: unknown): DayState;
export function parsePendingOperations(raw: unknown): PendingOperation[];
