const MUTATIONS = new Set(["add_log", "delete_log", "add_todo", "toggle_todo", "delete_todo"]);
const IMPORT_BATCH_SIZE = 100;
const MAX_IMPORT_ID_LENGTH = 80;

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

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function logFingerprint(value) {
  if (!object(value)) return "";
  const kind = text(value.kind);
  const label = text(value.label);
  const loggedAt = number(value.loggedAt);
  if (!kind || !label || loggedAt === null) return "";
  return JSON.stringify([
    kind,
    label,
    text(value.detail),
    number(value.amount),
    loggedAt,
  ]);
}

function todoFingerprint(value) {
  if (!object(value)) return "";
  const label = text(value.text);
  const createdAt = number(value.createdAt);
  if (!label || createdAt === null) return "";
  return JSON.stringify([label, createdAt]);
}

function missingEntries(localEntries, remoteEntries, fingerprint) {
  const remoteIds = new Set(remoteEntries.map((entry) => object(entry) ? text(entry.id) : "").filter(Boolean));
  const remoteFingerprints = new Set(remoteEntries.map(fingerprint).filter(Boolean));
  return localEntries.filter((entry) => {
    if (!object(entry)) return false;
    const id = text(entry.id);
    const signature = fingerprint(entry);
    if (id && remoteIds.has(id)) return false;
    if (signature && remoteFingerprints.has(signature)) return false;
    return Boolean(id && signature);
  });
}

export function selectMissingDayEntries(localDay, remoteDay) {
  const local = dayFrom(localDay);
  const remote = dayFrom(remoteDay);
  return {
    logs: missingEntries(local.logs, remote.logs, logFingerprint),
    todos: missingEntries(local.todos, remote.todos, todoFingerprint),
  };
}

function batches(values, size = IMPORT_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function boundedBatchImportId(importId, index) {
  const suffix = `:batch:${index}`;
  const base = String(importId).slice(0, MAX_IMPORT_ID_LENGTH - suffix.length);
  return `${base}${suffix}`;
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
      const logs = Array.isArray(day?.logs) ? day.logs : [];
      const todos = Array.isArray(day?.todos) ? day.todos : [];
      const logBatches = batches(logs);
      const todoBatches = batches(todos);
      const count = Math.max(logBatches.length, todoBatches.length, 1);
      let imported = { logs: [], todos: [] };
      for (let index = 0; index < count; index += 1) {
        imported = dayFrom(await client.importDay({
          date,
          importId: boundedBatchImportId(importId, index),
          logs: logBatches[index] ?? [],
          todos: todoBatches[index] ?? [],
        }));
      }
      return imported;
    },
  };
}
