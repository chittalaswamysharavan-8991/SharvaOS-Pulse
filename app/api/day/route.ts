import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { dailyLogs, dailyTodos } from "../../../db/schema";
import {
  cleanText,
  isValidWaterAmount,
  normalizeImportedLog,
  normalizeImportedTodo,
} from "../../../lib/pulse-reliability.mjs";

export const runtime = "edge";

type Kind = "water" | "smoke" | "food";
type Db = Awaited<ReturnType<typeof getDb>>;

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function userKey(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email");
  const host = new URL(request.url).hostname;
  const identity =
    email || (host === "localhost" || host.endsWith(".terminal.local") ? "local-preview" : "");
  if (!identity) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`sharvaos:${identity.toLowerCase()}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  return Response.json({ error: message }, { status: 500 });
}

async function readDay(db: Db, identity: string, date: string) {
  const [logs, todos] = await Promise.all([
    db.select().from(dailyLogs)
      .where(and(eq(dailyLogs.userKey, identity), eq(dailyLogs.logDate, date)))
      .orderBy(desc(dailyLogs.loggedAt)),
    db.select().from(dailyTodos)
      .where(and(eq(dailyTodos.userKey, identity), eq(dailyTodos.taskDate, date)))
      .orderBy(dailyTodos.createdAt),
  ]);
  return { logs, todos };
}

async function readLog(db: Db, identity: string, date: string, id: string) {
  const [record] = await db.select().from(dailyLogs).where(and(
    eq(dailyLogs.id, id),
    eq(dailyLogs.userKey, identity),
    eq(dailyLogs.logDate, date),
  ));
  return record;
}

async function readTodo(db: Db, identity: string, date: string, id: string) {
  const [record] = await db.select().from(dailyTodos).where(and(
    eq(dailyTodos.id, id),
    eq(dailyTodos.userKey, identity),
    eq(dailyTodos.taskDate, date),
  ));
  return record;
}

async function confirmedResponse(
  db: Db,
  identity: string,
  date: string,
  confirmation: Record<string, unknown>,
  status = 200,
) {
  return Response.json({
    ok: true,
    confirmation: { ...confirmation, confirmed: true },
    day: await readDay(db, identity, date),
  }, { status });
}

export async function GET(request: Request) {
  const identity = await userKey(request);
  if (!identity) return Response.json({ error: "Sign in required" }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date");
  if (!validDate(date)) return Response.json({ error: "Valid date is required" }, { status: 400 });

  try {
    return Response.json(await readDay(await getDb(), identity, date));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  const identity = await userKey(request);
  if (!identity) return Response.json({ error: "Sign in required" }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.action;
    const date = body.date;
    if (!validDate(date)) return Response.json({ error: "Valid date is required" }, { status: 400 });
    const db = await getDb();

    if (action === "add_log") {
      const id = cleanText(body.id, 80);
      const kind = body.kind as Kind;
      const label = cleanText(body.label);
      const detail = cleanText(body.detail, 100);
      const loggedAt = Number(body.loggedAt);
      const amount = kind === "water" ? Number(body.amount) : null;
      if (!id || !["water", "smoke", "food"].includes(kind) || !label || !Number.isFinite(loggedAt) || loggedAt <= 0) {
        return Response.json({ error: "Invalid log entry" }, { status: 400 });
      }
      if (kind === "water" && !isValidWaterAmount(amount)) {
        return Response.json({ error: "Water amount must be a whole number from 50 to 2000 ml" }, { status: 400 });
      }
      await db.insert(dailyLogs).values({
        id, userKey: identity, logDate: date, kind, label, detail,
        amount, loggedAt, source: cleanText(body.source, 20) || "web",
      }).onConflictDoNothing();
      const record = await readLog(db, identity, date, id);
      if (!record) {
        return Response.json({ error: "Log write could not be confirmed" }, { status: 409 });
      }
      if (record.kind !== kind || record.label !== label || record.loggedAt !== loggedAt || record.amount !== amount) {
        return Response.json({ error: "Log idempotency key conflicts with another record" }, { status: 409 });
      }
      return confirmedResponse(db, identity, date, { action, id, state: "persisted", record }, 201);
    }

    if (action === "delete_log") {
      const id = cleanText(body.id, 80);
      if (!id) return Response.json({ error: "Valid log id is required" }, { status: 400 });
      await db.delete(dailyLogs).where(and(
        eq(dailyLogs.id, id),
        eq(dailyLogs.userKey, identity),
        eq(dailyLogs.logDate, date),
      ));
      if (await readLog(db, identity, date, id)) throw new Error("Log deletion could not be confirmed");
      return confirmedResponse(db, identity, date, { action, id, state: "absent" });
    }

    if (action === "add_todo") {
      const id = cleanText(body.id, 80);
      const text = cleanText(body.text);
      const createdAt = Number(body.createdAt);
      if (!id || !text || !Number.isFinite(createdAt) || createdAt <= 0) {
        return Response.json({ error: "Invalid task" }, { status: 400 });
      }
      await db.insert(dailyTodos).values({
        id, userKey: identity, taskDate: date, text, done: false,
        createdAt, updatedAt: createdAt,
      }).onConflictDoNothing();
      const record = await readTodo(db, identity, date, id);
      if (!record) return Response.json({ error: "Task write could not be confirmed" }, { status: 409 });
      if (record.text !== text || record.createdAt !== createdAt) {
        return Response.json({ error: "Task idempotency key conflicts with another record" }, { status: 409 });
      }
      return confirmedResponse(db, identity, date, { action, id, state: "persisted", record }, 201);
    }

    if (action === "toggle_todo") {
      const id = cleanText(body.id, 80);
      if (!id) return Response.json({ error: "Valid task id is required" }, { status: 400 });
      const done = Boolean(body.done);
      await db.update(dailyTodos).set({ done, updatedAt: Date.now() }).where(and(
        eq(dailyTodos.id, id),
        eq(dailyTodos.userKey, identity),
        eq(dailyTodos.taskDate, date),
      ));
      const record = await readTodo(db, identity, date, id);
      if (!record) return Response.json({ error: "Task was not found" }, { status: 404 });
      if (record.done !== done) throw new Error("Task update could not be confirmed");
      return confirmedResponse(db, identity, date, { action, id, state: done ? "complete" : "open", record });
    }

    if (action === "delete_todo") {
      const id = cleanText(body.id, 80);
      if (!id) return Response.json({ error: "Valid task id is required" }, { status: 400 });
      await db.delete(dailyTodos).where(and(
        eq(dailyTodos.id, id),
        eq(dailyTodos.userKey, identity),
        eq(dailyTodos.taskDate, date),
      ));
      if (await readTodo(db, identity, date, id)) throw new Error("Task deletion could not be confirmed");
      return confirmedResponse(db, identity, date, { action, id, state: "absent" });
    }

    if (action === "import_day") {
      const logs = Array.isArray(body.logs) ? body.logs.slice(0, 100) : [];
      const todos = Array.isArray(body.todos) ? body.todos.slice(0, 100) : [];
      let importedLogs = 0;
      let importedTodos = 0;
      for (const raw of logs) {
        const row = normalizeImportedLog(raw);
        if (!row) continue;
        await db.insert(dailyLogs).values({
          ...row, userKey: identity, logDate: date, kind: row.kind as Kind,
          source: "device-import",
        }).onConflictDoNothing();
        if (await readLog(db, identity, date, row.id)) importedLogs += 1;
      }
      for (const raw of todos) {
        const row = normalizeImportedTodo(raw);
        if (!row) continue;
        await db.insert(dailyTodos).values({
          ...row, userKey: identity, taskDate: date, updatedAt: row.createdAt,
        }).onConflictDoNothing();
        if (await readTodo(db, identity, date, row.id)) importedTodos += 1;
      }
      return confirmedResponse(db, identity, date, {
        action, state: "imported", importedLogs, importedTodos,
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
