const LOG_KINDS = new Set(["water", "smoke", "food"]);

export function cleanText(value, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function isValidWaterAmount(value) {
  return Number.isInteger(value) && value >= 50 && value <= 2000;
}

export function normalizeImportedLog(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = cleanText(raw.id, 80);
  const kind = raw.kind;
  const label = cleanText(raw.label);
  const detail = cleanText(raw.detail, 100);
  const loggedAt = Number(raw.loggedAt);
  if (!id || !LOG_KINDS.has(kind) || !label || !Number.isFinite(loggedAt) || loggedAt <= 0) {
    return null;
  }
  const amount = kind === "water" ? Number(raw.amount) : null;
  if (kind === "water" && !isValidWaterAmount(amount)) return null;
  return { id, kind, label, detail, amount, loggedAt };
}

export function normalizeImportedTodo(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = cleanText(raw.id, 80);
  const text = cleanText(raw.text);
  const createdAt = Number(raw.createdAt);
  if (!id || !text || !Number.isFinite(createdAt) || createdAt <= 0) return null;
  return { id, text, done: Boolean(raw.done), createdAt };
}

export function normalizeDay(value) {
  const logs = Array.isArray(value?.logs) ? value.logs.filter(Boolean) : [];
  const todos = Array.isArray(value?.todos) ? value.todos.filter(Boolean) : [];
  return { logs, todos };
}

export function applyOperation(dayValue, body) {
  const day = normalizeDay(dayValue);
  if (!body || typeof body !== "object") return day;
  const action = body.action;

  if (action === "add_log") {
    const entry = normalizeImportedLog(body);
    if (!entry || day.logs.some((item) => item.id === entry.id)) return day;
    return { ...day, logs: [entry, ...day.logs] };
  }

  if (action === "delete_log") {
    const id = cleanText(body.id, 80);
    return id ? { ...day, logs: day.logs.filter((item) => item.id !== id) } : day;
  }

  if (action === "add_todo") {
    const todo = normalizeImportedTodo(body);
    if (!todo || day.todos.some((item) => item.id === todo.id)) return day;
    return { ...day, todos: [...day.todos, todo] };
  }

  if (action === "toggle_todo") {
    const id = cleanText(body.id, 80);
    if (!id) return day;
    return {
      ...day,
      todos: day.todos.map((item) => item.id === id ? { ...item, done: Boolean(body.done) } : item),
    };
  }

  if (action === "delete_todo") {
    const id = cleanText(body.id, 80);
    return id ? { ...day, todos: day.todos.filter((item) => item.id !== id) } : day;
  }

  if (action === "import_day") {
    const logs = Array.isArray(body.logs)
      ? body.logs.map(normalizeImportedLog).filter(Boolean)
      : [];
    const todos = Array.isArray(body.todos)
      ? body.todos.map(normalizeImportedTodo).filter(Boolean)
      : [];
    const logIds = new Set(day.logs.map((item) => item.id));
    const todoIds = new Set(day.todos.map((item) => item.id));
    return {
      logs: [...logs.filter((item) => !logIds.has(item.id)), ...day.logs]
        .sort((left, right) => right.loggedAt - left.loggedAt),
      todos: [...day.todos, ...todos.filter((item) => !todoIds.has(item.id))]
        .sort((left, right) => left.createdAt - right.createdAt),
    };
  }

  return day;
}

export function applyPendingOperations(day, operations) {
  return (Array.isArray(operations) ? operations : []).reduce(
    (current, operation) => applyOperation(current, operation?.body ?? operation),
    normalizeDay(day),
  );
}

export function parsePendingOperations(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((operation) =>
      operation &&
      typeof operation === "object" &&
      typeof operation.queueId === "string" &&
      operation.body &&
      typeof operation.body === "object",
    );
  } catch {
    return [];
  }
}
