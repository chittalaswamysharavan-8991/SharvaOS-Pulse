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
  location?: Pick<Location, "origin" | "href" | "assign">;
  history?: Pick<History, "replaceState">;
}): {
  isGoogleEnabled(): Promise<boolean>;
  getGoogleAuthorizeUrl(input?: { redirectTo?: string }): string;
  beginGoogleSignIn(input?: { redirectTo?: string }): string;
  captureOAuthSession(url?: string): Promise<PulseSession | null>;
  requestOtp(email: string): Promise<{ email: string }>;
  verifyOtp(input: { email: string; token: string }): Promise<PulseSession>;
  restoreSession(): Promise<PulseSession | null>;
  getAccessToken(): Promise<string>;
  getSession(): PulseSession | null;
  signOut(): Promise<void>;
  clearSession(): void;
};
