import { and, desc, eq } from "drizzle-orm";
import { ensureSchema, getDb } from "../../../db";
import { dailyLogs, dailyTodos } from "../../../db/schema";

export const runtime = "edge";

type Kind = "water" | "smoke" | "food";

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

function cleanText(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  const identity = await userKey(request);
  if (!identity) return Response.json({ error: "Sign in required" }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date");
  if (!validDate(date)) return Response.json({ error: "Valid date is required" }, { status: 400 });

  try {
    await ensureSchema();
    const db = await getDb();
    const [logs, todos] = await Promise.all([
      db.select().from(dailyLogs)
        .where(and(eq(dailyLogs.userKey, identity), eq(dailyLogs.logDate, date)))
        .orderBy(desc(dailyLogs.loggedAt)),
      db.select().from(dailyTodos)
        .where(and(eq(dailyTodos.userKey, identity), eq(dailyTodos.taskDate, date)))
        .orderBy(dailyTodos.createdAt),
    ]);
    return Response.json({ logs, todos });
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
    await ensureSchema();
    const db = await getDb();

    if (action === "add_log") {
      const id = cleanText(body.id, 80);
      const kind = body.kind as Kind;
      const label = cleanText(body.label);
      const detail = cleanText(body.detail, 100);
      const loggedAt = Number(body.loggedAt);
      const amount = body.amount == null ? null : Number(body.amount);
      if (!id || !["water", "smoke", "food"].includes(kind) || !label || !Number.isFinite(loggedAt)) {
        return Response.json({ error: "Invalid log entry" }, { status: 400 });
      }
      await db.insert(dailyLogs).values({
        id, userKey: identity, logDate: date, kind, label, detail,
        amount: Number.isFinite(amount) ? amount : null,
        loggedAt, source: cleanText(body.source, 20) || "web",
      }).onConflictDoNothing();
      return Response.json({ ok: true }, { status: 201 });
    }

    if (action === "delete_log") {
      const id = cleanText(body.id, 80);
      await db.delete(dailyLogs).where(and(eq(dailyLogs.id, id), eq(dailyLogs.userKey, identity)));
      return Response.json({ ok: true });
    }

    if (action === "add_todo") {
      const id = cleanText(body.id, 80);
      const text = cleanText(body.text);
      const createdAt = Number(body.createdAt);
      if (!id || !text || !Number.isFinite(createdAt)) {
        return Response.json({ error: "Invalid task" }, { status: 400 });
      }
      await db.insert(dailyTodos).values({
        id, userKey: identity, taskDate: date, text, done: false,
        createdAt, updatedAt: createdAt,
      }).onConflictDoNothing();
      return Response.json({ ok: true }, { status: 201 });
    }

    if (action === "toggle_todo") {
      const id = cleanText(body.id, 80);
      await db.update(dailyTodos).set({
        done: Boolean(body.done), updatedAt: Date.now(),
      }).where(and(eq(dailyTodos.id, id), eq(dailyTodos.userKey, identity)));
      return Response.json({ ok: true });
    }

    if (action === "delete_todo") {
      const id = cleanText(body.id, 80);
      await db.delete(dailyTodos).where(and(eq(dailyTodos.id, id), eq(dailyTodos.userKey, identity)));
      return Response.json({ ok: true });
    }

    if (action === "import_day") {
      const logs = Array.isArray(body.logs) ? body.logs.slice(0, 100) : [];
      const todos = Array.isArray(body.todos) ? body.todos.slice(0, 100) : [];
      for (const raw of logs) {
        const row = raw as Record<string, unknown>;
        const kind = row.kind as Kind;
        if (!row.id || !["water", "smoke", "food"].includes(kind)) continue;
        await db.insert(dailyLogs).values({
          id: cleanText(row.id, 80), userKey: identity, logDate: date, kind,
          label: cleanText(row.label), detail: cleanText(row.detail, 100),
          amount: row.amount == null ? null : Number(row.amount),
          loggedAt: Number(row.timestamp) || Date.now(), source: "device-import",
        }).onConflictDoNothing();
      }
      for (const raw of todos) {
        const row = raw as Record<string, unknown>;
        if (!row.id || !cleanText(row.text)) continue;
        const createdAt = Number(row.createdAt) || Date.now();
        await db.insert(dailyTodos).values({
          id: cleanText(row.id, 80), userKey: identity, taskDate: date,
          text: cleanText(row.text), done: Boolean(row.done), createdAt, updatedAt: createdAt,
        }).onConflictDoNothing();
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
