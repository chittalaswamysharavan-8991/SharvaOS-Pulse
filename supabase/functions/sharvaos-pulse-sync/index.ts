import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CONTRACT = "sharvaos.pulse.v1";
const MUTATIONS = new Set(["add_log", "delete_log", "add_todo", "toggle_todo", "delete_todo"]);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function validObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function statusFor(error: { code?: string; message?: string }) {
  if (error.code === "23505") return 409;
  if (error.code === "22023") return 422;
  if (error.code === "42501") return 403;
  return 502;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ status: "failed", message: "POST required" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ status: "failed", message: "Authentication required" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } },
  );

  const token = authorization.slice("Bearer ".length);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return json({ status: "failed", message: "Invalid authenticated session" }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!validObject(parsed)) throw new Error("object required");
    body = parsed;
  } catch {
    return json({ status: "failed", message: "Valid JSON object required" }, 400);
  }

  const action = String(body.action ?? "");
  const date = body.date;
  if (!validDate(date)) return json({ status: "failed", message: "Valid date required" }, 422);

  if (action === "read_day") {
    const { data, error } = await supabase.rpc("pulse_read_day", { p_date: date });
    if (error) return json({ status: "failed", message: "Canonical read failed", code: error.code }, statusFor(error));
    return json({ status: "saved", day: data, canonical: { owner: "supabase", contract: CONTRACT } });
  }

  if (action === "apply_mutation") {
    const mutation = String(body.mutation ?? "");
    const idempotencyKey = String(body.idempotency_key ?? "");
    if (!MUTATIONS.has(mutation)) return json({ status: "failed", message: "Unsupported mutation" }, 422);
    if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
      return json({ status: "failed", message: "Valid idempotency key required" }, 422);
    }
    if (!validObject(body.payload)) return json({ status: "failed", message: "Mutation payload required" }, 422);

    const { data, error } = await supabase.rpc("pulse_apply_mutation", {
      p_date: date,
      p_idempotency_key: idempotencyKey,
      p_action: mutation,
      p_payload: body.payload,
    });
    if (error) return json({ status: "failed", message: error.message, code: error.code }, statusFor(error));
    return json({ status: "saved", ...data });
  }

  if (action === "import_day") {
    const importId = String(body.import_id ?? "");
    const logs = Array.isArray(body.logs) ? body.logs.slice(0, 100) : [];
    const todos = Array.isArray(body.todos) ? body.todos.slice(0, 100) : [];
    if (importId.length < 8 || importId.length > 80) return json({ status: "failed", message: "Valid import_id required" }, 422);

    let importedLogs = 0;
    let importedTodos = 0;
    for (const raw of logs) {
      if (!validObject(raw) || typeof raw.id !== "string") continue;
      const payload = { ...raw, source: "device-import" };
      const { error } = await supabase.rpc("pulse_apply_mutation", {
        p_date: date,
        p_idempotency_key: `${importId}:log:${raw.id}`.slice(0, 160),
        p_action: "add_log",
        p_payload: payload,
      });
      if (error) return json({ status: "failed", message: "Log import failed", code: error.code }, statusFor(error));
      importedLogs += 1;
    }

    for (const raw of todos) {
      if (!validObject(raw) || typeof raw.id !== "string") continue;
      const add = await supabase.rpc("pulse_apply_mutation", {
        p_date: date,
        p_idempotency_key: `${importId}:todo:${raw.id}`.slice(0, 160),
        p_action: "add_todo",
        p_payload: raw,
      });
      if (add.error) return json({ status: "failed", message: "Task import failed", code: add.error.code }, statusFor(add.error));
      if (raw.done === true) {
        const toggle = await supabase.rpc("pulse_apply_mutation", {
          p_date: date,
          p_idempotency_key: `${importId}:todo:${raw.id}:done`.slice(0, 160),
          p_action: "toggle_todo",
          p_payload: { id: raw.id, done: true },
        });
        if (toggle.error) return json({ status: "failed", message: "Task state import failed", code: toggle.error.code }, statusFor(toggle.error));
      }
      importedTodos += 1;
    }

    const { data: day, error: readError } = await supabase.rpc("pulse_read_day", { p_date: date });
    if (readError) return json({ status: "failed", message: "Import read-back failed", code: readError.code }, statusFor(readError));
    return json({
      status: "saved",
      confirmation: { confirmed: true, state: "imported", importedLogs, importedTodos },
      day,
      canonical: { owner: "supabase", contract: CONTRACT },
    });
  }

  return json({ status: "failed", message: "Unsupported action" }, 422);
});
