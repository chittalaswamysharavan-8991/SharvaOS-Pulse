export type PulseSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in?: number;
  token_type?: string;
  user?: { id?: string; email?: string };
  [key: string]: unknown;
};

export class PulseAuthError extends Error {
  status: number;
  code?: string;
}

export function createPulseAuthClient(input: {
  projectUrl: string;
  publishableKey: string;
  fetchImpl?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  storageKey?: string;
}): {
  requestOtp(email: string): Promise<{ email: string }>;
  verifyOtp(input: { email: string; token: string }): Promise<PulseSession>;
  restoreSession(): Promise<PulseSession | null>;
  getAccessToken(): Promise<string>;
  getSession(): PulseSession | null;
  signOut(): Promise<void>;
  clearSession(): void;
};
