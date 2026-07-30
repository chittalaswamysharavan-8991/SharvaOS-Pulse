const MUTATIONS = new Set(["add_log", "delete_log", "add_todo", "toggle_todo", "delete_todo"]);

export class PulseTransportError extends Error {
  constructor(message, status = 0, code) {
    super(message);
    this.name = "PulseTransportError";
    this.status = status;
    this.code = code;
  }
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayFrom(payload) {
  const value = payload?.day ?? payload;
  if (!value || !Array.isArray(value.logs) || !Array.isArray(value.todos)) {
    throw new PulseTransportError("Canonical response did not include a valid day", 502, "INVALID_DAY");
  }
  return { logs: value.logs, todos: value.todos };
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PulseTransportError(
      payload.error || payload.message || "Pulse sync unavailable",
      response.status,
      payload.code,
    );
  }
  return payload;
}

export function createD1PulseTransport({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  return {
    owner: "d1",
    async readDay(date) {
      if (!validDate(date)) throw new TypeError("Valid date required");
      return dayFrom(await parseResponse(await fetchImpl(`/api/day?date=${date}`, { cache: "no-store" })));
    },
    async mutate(date, operation) {
      if (!validDate(date)) throw new TypeError("Valid date required");
      return dayFrom(await parseResponse(await fetchImpl("/api/day", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...operation, date }),
      })));
    },
    async importDay(date, day) {
      return this.mutate(date, { action: "import_day", logs: day.logs, todos: day.todos });
    },
  };
}

export function createCanonicalPulseTransport({ client }) {
  if (!client || typeof client.readDay !== "function" || typeof client.applyMutation !== "function") {
    throw new TypeError("canonical client required");
  }
  return {
    owner: "supabase",
    async readDay(date) {
      return dayFrom(await client.readDay(date));
    },
    async mutate(date, operation, operationId) {
      const action = operation?.action;
      if (!MUTATIONS.has(action)) throw new PulseTransportError("Unsupported mutation", 422, "UNSUPPORTED_MUTATION");
      if (typeof operationId !== "string" || operationId.length < 8) {
        throw new TypeError("Stable operationId required");
      }
      const payload = { ...operation };
      delete payload.action;
      delete payload.date;
      return dayFrom(await client.applyMutation({
        date,
        idempotencyKey: `device:${operationId}`.slice(0, 160),
        mutation: action,
        payload,
      }));
    },
    async importDay(date, day, importId = `device-initial:${date}`) {
      return dayFrom(await client.importDay({
        date,
        importId,
        logs: day.logs,
        todos: day.todos,
      }));
    },
  };
}
