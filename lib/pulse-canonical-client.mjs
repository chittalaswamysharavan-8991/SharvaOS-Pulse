const MUTATIONS = new Set(["add_log", "delete_log", "add_todo", "toggle_todo", "delete_todo"]);

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`);
  return value.trim();
}

export function createPulseCanonicalClient({
  functionUrl,
  accessToken,
  getAccessToken,
  publishableKey,
  fetchImpl = globalThis.fetch,
}) {
  const endpoint = required(functionUrl, "functionUrl");
  if (!endpoint.startsWith("https://")) throw new TypeError("functionUrl must use HTTPS");
  const fixedToken = typeof accessToken === "string" ? accessToken.trim() : "";
  if (!fixedToken && typeof getAccessToken !== "function") {
    throw new TypeError("accessToken or getAccessToken is required");
  }
  const apiKey = typeof publishableKey === "string" ? publishableKey.trim() : "";
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");

  async function token() {
    const value = typeof getAccessToken === "function" ? await getAccessToken() : fixedToken;
    return required(value, "accessToken");
  }

  async function request(body) {
    const bearer = await token();
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        ...(apiKey ? { apikey: apiKey } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({ status: "failed", message: "Invalid canonical response" }));
    if (!response.ok) {
      const error = new Error(payload.message || "Canonical Pulse request failed");
      error.status = response.status;
      error.code = payload.code;
      throw error;
    }
    return payload;
  }

  return {
    async readDay(date) {
      if (!validDate(date)) throw new TypeError("Valid date required");
      return request({ action: "read_day", date });
    },
    async applyMutation({ date, idempotencyKey, mutation, payload }) {
      if (!validDate(date)) throw new TypeError("Valid date required");
      if (!MUTATIONS.has(mutation)) throw new TypeError("Unsupported mutation");
      const key = required(idempotencyKey, "idempotencyKey");
      if (key.length < 8 || key.length > 160) throw new TypeError("Valid idempotencyKey required");
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Mutation payload required");
      return request({ action: "apply_mutation", date, idempotency_key: key, mutation, payload });
    },
    async importDay({ date, importId, logs = [], todos = [] }) {
      if (!validDate(date)) throw new TypeError("Valid date required");
      const id = required(importId, "importId");
      if (id.length < 8 || id.length > 80) throw new TypeError("Valid importId required");
      return request({ action: "import_day", date, import_id: id, logs, todos });
    },
  };
}
