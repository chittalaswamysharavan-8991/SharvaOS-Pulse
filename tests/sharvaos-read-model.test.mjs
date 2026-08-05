import assert from "node:assert/strict";
import test from "node:test";
import { createSharvaOSReadModelClient } from "../lib/sharvaos-read-model.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Today read model joins canonical project/task data and preserves partial coverage", async () => {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const todayAtNoon = `${today}T06:30:00.000Z`;
  const calls = [];
  const rows = {
    projects: [{
      id: "project-1", name: "SharvaOS", summary: "Canonical front door", status: "active",
      priority: 1, progress: 60, current_phase: "Integration", next_action: "Verify production",
      blocker: null, source_name: "Supabase", source_url: null, last_verified_at: now.toISOString(),
      freshness_status: "current", is_featured: true, updated_at: now.toISOString(),
    }],
    tasks: [{
      id: "task-1", project_id: "project-1", title: "Run assurance", description: "Read-only QA",
      status: "in_progress", priority: 1, due_at: null, source_name: "SharvaTask", source_url: null,
      last_verified_at: now.toISOString(), updated_at: now.toISOString(),
    }],
    connectors: [{
      id: "connector-1", name: "Notion", category: "source", status: "healthy",
      last_checked_at: now.toISOString(), last_success_at: now.toISOString(), latency_ms: 80,
      error_summary: null, details: {}, updated_at: now.toISOString(),
    }],
    inbox_items: [{ id: "inbox-1", title: "Review item", status: "open", priority: 2, updated_at: now.toISOString() }],
    approval_queue: [],
    automation_runs: [],
    source_events: [{
      id: "event-1", source_system: "Google Calendar", event_type: "calendar_event", title: "Exam",
      summary: "Finish exam", confidence: 1, processing_status: "processed",
      occurred_at: todayAtNoon, captured_at: now.toISOString(), processed_at: now.toISOString(),
    }],
  };

  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const table = new URL(url).pathname.split("/").at(-1);
    if (table === "approval_queue") return jsonResponse({ message: "temporary failure" }, 500);
    return jsonResponse(rows[table] || []);
  };

  const client = createSharvaOSReadModelClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "publishable-test-key",
    accessToken: "owner-token",
    fetchImpl,
  });
  const model = await client.readToday();

  assert.equal(model.mainHighlight?.title, "SharvaOS");
  assert.equal(model.nextAction, "Verify production");
  assert.equal(model.openTasks[0].project_name, "SharvaOS");
  assert.equal(model.calendarEvents.length, 1);
  assert.equal(model.counts.activeProjects, 1);
  assert.equal(model.counts.openTasks, 1);
  assert.match(model.sourceErrors.approvals, /temporary failure/);
  assert.equal(calls.length, 7);
  assert.ok(calls.every(({ init }) => init.headers.authorization === "Bearer owner-token"));
  assert.ok(calls.every(({ init }) => init.headers.apikey === "publishable-test-key"));
  assert.ok(calls.every(({ init }) => !init.method || init.method === "GET"));
});

test("Today read model fails closed on an unauthorized canonical read", async () => {
  const client = createSharvaOSReadModelClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "publishable-test-key",
    accessToken: "expired-token",
    fetchImpl: async () => jsonResponse({ message: "JWT expired" }, 401),
  });

  await assert.rejects(client.readToday(), (error) => error.status === 401 && /JWT expired/.test(error.message));
});
