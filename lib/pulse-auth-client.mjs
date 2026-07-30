const DEFAULT_STORAGE_KEY = "sharvaos-pulse-auth:v1";

export class PulseAuthError extends Error {
  constructor(message, status = 0, code) {
    super(message);
    this.name = "PulseAuthError";
    this.status = status;
    this.code = code;
  }
}

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`);
  return value.trim();
}

function normalizeUrl(value, name) {
  const url = required(value, name).replace(/\/+$/, "");
  if (!url.startsWith("https://")) throw new TypeError(`${name} must use HTTPS`);
  return url;
}

function normalizeEmail(value) {
  const email = required(value, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TypeError("Valid email required");
  return email;
}

function normalizeSession(value) {
  if (!value || typeof value !== "object") return null;
  const accessToken = value.access_token;
  const refreshToken = value.refresh_token;
  if (typeof accessToken !== "string" || !accessToken || typeof refreshToken !== "string" || !refreshToken) return null;
  const expiresAt = Number(value.expires_at) || Math.floor(Date.now() / 1000) + Number(value.expires_in || 3600);
  return { ...value, access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt };
}

function readStored(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? normalizeSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function createPulseAuthClient({
  projectUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  storageKey = DEFAULT_STORAGE_KEY,
}) {
  const baseUrl = normalizeUrl(projectUrl, "projectUrl");
  const apiKey = required(publishableKey, "publishableKey");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  let session = readStored(storage, storageKey);

  function persist(next) {
    session = normalizeSession(next);
    try {
      if (session) storage?.setItem?.(storageKey, JSON.stringify(session));
      else storage?.removeItem?.(storageKey);
    } catch {}
    return session;
  }

  async function request(path, { body, accessToken, method = "POST" } = {}) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          apikey: apiKey,
          "content-type": "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new PulseAuthError("Authentication service unavailable");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new PulseAuthError(
        payload.msg || payload.message || payload.error_description || payload.error || "Authentication failed",
        response.status,
        payload.code || payload.error_code,
      );
    }
    return payload;
  }

  async function refresh() {
    if (!session?.refresh_token) return null;
    try {
      const payload = await request("/auth/v1/token?grant_type=refresh_token", {
        body: { refresh_token: session.refresh_token },
      });
      return persist(payload);
    } catch (error) {
      if (error instanceof PulseAuthError && error.status >= 400 && error.status < 500) persist(null);
      throw error;
    }
  }

  async function restoreSession() {
    if (!session) return null;
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at > now + 60) return session;
    return refresh();
  }

  return {
    async requestOtp(email) {
      const normalized = normalizeEmail(email);
      await request("/auth/v1/otp", { body: { email: normalized, create_user: false } });
      return { email: normalized };
    },

    async verifyOtp({ email, token }) {
      const normalized = normalizeEmail(email);
      const code = required(token, "token");
      if (!/^\d{6}$/.test(code)) throw new TypeError("Enter the 6-digit code");
      const payload = await request("/auth/v1/verify", {
        body: { email: normalized, token: code, type: "email" },
      });
      const next = persist(payload);
      if (!next) throw new PulseAuthError("Authentication response did not include a session", 502);
      return next;
    },

    restoreSession,

    async getAccessToken() {
      const active = await restoreSession();
      if (!active?.access_token) throw new PulseAuthError("Sign in required", 401, "AUTH_REQUIRED");
      return active.access_token;
    },

    getSession() {
      return session;
    },

    async signOut() {
      const accessToken = session?.access_token;
      persist(null);
      if (!accessToken) return;
      try {
        await request("/auth/v1/logout", { accessToken });
      } catch {}
    },

    clearSession() {
      persist(null);
    },
  };
}
