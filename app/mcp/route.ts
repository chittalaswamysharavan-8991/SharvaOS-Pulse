import { and, desc, eq } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getDb } from "../../db";
import { dailyLogs, dailyTodos } from "../../db/schema";

export const runtime = "edge";

type Db = Awaited<ReturnType<typeof getDb>>;

function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

async function identityFor(request: Request) {
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

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

async function readLog(db: Db, userKey: string, date: string, id: string) {
  const [record] = await db.select().from(dailyLogs).where(and(
    eq(dailyLogs.id, id),
    eq(dailyLogs.userKey, userKey),
    eq(dailyLogs.logDate, date),
  ));
  return record;
}

async function readTodo(db: Db, userKey: string, date: string, id: string) {
  const [record] = await db.select().from(dailyTodos).where(and(
    eq(dailyTodos.id, id),
    eq(dailyTodos.userKey, userKey),
    eq(dailyTodos.taskDate, date),
  ));
  return record;
}

function buildServer(userKey: string) {
  const server = new McpServer(
    { name: "SharvaOS Daily Pulse", version: "2.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool("get_today", {
    title: "Get Sharva's daily pulse",
    description: "Read today's water, smoke, food, tasks, and recent timeline from SharvaOS.",
    inputSchema: { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() },
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  }, async ({ date }) => {
    const selectedDate = date ?? todayInIndia();
    const db = await getDb();
    const [logs, todos] = await Promise.all([
      db.select().from(dailyLogs)
        .where(and(eq(dailyLogs.userKey, userKey), eq(dailyLogs.logDate, selectedDate)))
        .orderBy(desc(dailyLogs.loggedAt)),
      db.select().from(dailyTodos)
        .where(and(eq(dailyTodos.userKey, userKey), eq(dailyTodos.taskDate, selectedDate)))
        .orderBy(dailyTodos.createdAt),
    ]);
    return textResult({
      date: selectedDate,
      waterMl: logs.filter((x) => x.kind === "water").reduce((sum, x) => sum + (x.amount ?? 0), 0),
      smokeCount: logs.filter((x) => x.kind === "smoke").length,
      meals: logs.filter((x) => x.kind === "food").map((x) => ({ label: x.label, mealType: x.detail, loggedAt: x.loggedAt })),
      tasks: todos.map((x) => ({ id: x.id, text: x.text, done: x.done })),
      recent: logs.slice(0, 10),
    });
  });

  server.registerTool("log_water", {
    title: "Log water",
    description: "Add a water entry to SharvaOS for today.",
    inputSchema: { amountMl: z.number().int().min(50).max(2000), idempotencyKey: z.string().min(8).max(80).optional() },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  }, async ({ amountMl, idempotencyKey }) => {
    const now = Date.now();
    const date = todayInIndia();
    const id = idempotencyKey ?? crypto.randomUUID();
    const db = await getDb();
    await db.insert(dailyLogs).values({
      id, userKey, logDate: date, kind: "water",
      label: `${amountMl} ml water`, detail: "Hydration", amount: amountMl,
      loggedAt: now, source: "chatgpt",
    }).onConflictDoNothing();
    const record = await readLog(db, userKey, date, id);
    if (!record || record.amount !== amountMl || record.kind !== "water") {
      throw new Error("Water write could not be confirmed or the idempotency key conflicts.");
    }
    return textResult({ ok: true, confirmation: { confirmed: true, state: "persisted", record } });
  });

  server.registerTool("log_smoke", {
    title: "Log smoke",
    description: "Add one smoke entry to SharvaOS for today.",
    inputSchema: { idempotencyKey: z.string().min(8).max(80).optional() },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  }, async ({ idempotencyKey }) => {
    const now = Date.now();
    const date = todayInIndia();
    const id = idempotencyKey ?? crypto.randomUUID();
    const db = await getDb();
    await db.insert(dailyLogs).values({
      id, userKey, logDate: date, kind: "smoke",
      label: "Smoke", detail: "Logged via ChatGPT", loggedAt: now, source: "chatgpt",
    }).onConflictDoNothing();
    const record = await readLog(db, userKey, date, id);
    if (!record || record.kind !== "smoke") {
      throw new Error("Smoke write could not be confirmed or the idempotency key conflicts.");
    }
    return textResult({ ok: true, confirmation: { confirmed: true, state: "persisted", record } });
  });

  server.registerTool("log_food", {
    title: "Log food",
    description: "Add a meal or snack entry to SharvaOS for today.",
    inputSchema: {
      description: z.string().min(1).max(180),
      mealType: z.enum(["Breakfast", "Lunch", "Snack", "Dinner", "Meal"]).default("Meal"),
      idempotencyKey: z.string().min(8).max(80).optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  }, async ({ description, mealType, idempotencyKey }) => {
    const now = Date.now();
    const date = todayInIndia();
    const id = idempotencyKey ?? crypto.randomUUID();
    const label = description.trim();
    const db = await getDb();
    await db.insert(dailyLogs).values({
      id, userKey, logDate: date, kind: "food",
      label, detail: mealType, loggedAt: now, source: "chatgpt",
    }).onConflictDoNothing();
    const record = await readLog(db, userKey, date, id);
    if (!record || record.kind !== "food" || record.label !== label || record.detail !== mealType) {
      throw new Error("Food write could not be confirmed or the idempotency key conflicts.");
    }
    return textResult({ ok: true, confirmation: { confirmed: true, state: "persisted", record } });
  });

  server.registerTool("add_todo", {
    title: "Add today's task",
    description: "Add one clear action to today's SharvaOS focus list.",
    inputSchema: { text: z.string().min(1).max(180), idempotencyKey: z.string().min(8).max(80).optional() },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  }, async ({ text, idempotencyKey }) => {
    const now = Date.now();
    const date = todayInIndia();
    const id = idempotencyKey ?? crypto.randomUUID();
    const clean = text.trim();
    const db = await getDb();
    await db.insert(dailyTodos).values({
      id, userKey, taskDate: date, text: clean,
      done: false, createdAt: now, updatedAt: now,
    }).onConflictDoNothing();
    const record = await readTodo(db, userKey, date, id);
    if (!record || record.text !== clean) {
      throw new Error("Task write could not be confirmed or the idempotency key conflicts.");
    }
    return textResult({ ok: true, confirmation: { confirmed: true, state: "persisted", record } });
  });

  server.registerTool("complete_todo", {
    title: "Complete today's task",
    description: "Mark a specific SharvaOS task complete by its ID.",
    inputSchema: { taskId: z.string().min(1).max(80) },
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  }, async ({ taskId }) => {
    const date = todayInIndia();
    const db = await getDb();
    await db.update(dailyTodos).set({ done: true, updatedAt: Date.now() })
      .where(and(
        eq(dailyTodos.id, taskId),
        eq(dailyTodos.userKey, userKey),
        eq(dailyTodos.taskDate, date),
      ));
    const record = await readTodo(db, userKey, date, taskId);
    if (!record || !record.done) throw new Error("Task completion could not be confirmed.");
    return textResult({ ok: true, confirmation: { confirmed: true, state: "complete", record } });
  });

  return server;
}

async function handle(request: Request) {
  const userKey = await identityFor(request);
  if (!userKey) {
    return Response.json(
      { error: "SharvaOS MCP requires an authenticated owner identity." },
      { status: 401 },
    );
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = buildServer(userKey);
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
