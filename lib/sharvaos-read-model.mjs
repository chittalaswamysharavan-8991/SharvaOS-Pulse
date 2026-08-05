function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`);
  return value.trim();
}

function normalizeUrl(value, name) {
  const url = required(value, name).replace(/\/+$/, "");
  if (!url.startsWith("https://")) throw new TypeError(`${name} must use HTTPS`);
  return url;
}

function freshness(timestamp, now = Date.now()) {
  if (!timestamp) return { state: "unknown", ageHours: null };
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return { state: "unknown", ageHours: null };
  const ageHours = Math.max(0, (now - parsed) / 3_600_000);
  if (ageHours <= 6) return { state: "fresh", ageHours };
  if (ageHours <= 24) return { state: "aging", ageHours };
  return { state: "stale", ageHours };
}

function indiaDayKey(timestamp = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(timestamp));
}

function newestTimestamp(rows, fields) {
  let latest = null;
  for (const row of rows) {
    for (const field of fields) {
      const value = row?.[field];
      const parsed = value ? Date.parse(value) : NaN;
      if (Number.isFinite(parsed) && (!latest || parsed > latest)) latest = parsed;
    }
  }
  return latest ? new Date(latest).toISOString() : null;
}

function openStatus(value) {
  const status = String(value || "").toLowerCase();
  return !["done", "complete", "completed", "closed", "resolved", "archived", "cancelled", "canceled"].includes(status);
}

function safeRows(value) {
  return Array.isArray(value) ? value : [];
}

export function createSharvaOSReadModelClient({
  projectUrl,
  publishableKey,
  accessToken,
  getAccessToken,
  fetchImpl = globalThis.fetch,
}) {
  const baseUrl = normalizeUrl(projectUrl, "projectUrl");
  const apiKey = required(publishableKey, "publishableKey");
  const fixedToken = typeof accessToken === "string" ? accessToken.trim() : "";
  if (!fixedToken && typeof getAccessToken !== "function") {
    throw new TypeError("accessToken or getAccessToken is required");
  }
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");

  async function token() {
    const value = typeof getAccessToken === "function" ? await getAccessToken() : fixedToken;
    return required(value, "accessToken");
  }

  async function select(table, query) {
    const bearer = await token();
    const response = await fetchImpl(`${baseUrl}/rest/v1/${table}?${query}`, {
      headers: {
        accept: "application/json",
        apikey: apiKey,
        authorization: `Bearer ${bearer}`,
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.message || `Could not read ${table}`);
      error.status = response.status;
      error.code = payload?.code;
      error.source = table;
      throw error;
    }
    return safeRows(payload);
  }

  async function readToday() {
    const requests = {
      projects: select("projects", "select=id,name,summary,status,priority,progress,current_phase,next_action,blocker,source_name,source_url,last_verified_at,freshness_status,is_featured,updated_at&order=is_featured.desc,priority.asc,updated_at.desc&limit=12"),
      tasks: select("tasks", "select=id,project_id,title,description,status,priority,due_at,source_name,source_url,last_verified_at,updated_at&order=priority.asc,updated_at.desc&limit=40"),
      connectors: select("connectors", "select=id,name,category,status,last_checked_at,last_success_at,latency_ms,error_summary,details,updated_at&order=category.asc,name.asc&limit=40"),
      inbox: select("inbox_items", "select=id,title,summary,category,priority,status,source_system,source_url,occurred_at,created_at,updated_at&order=priority.asc,updated_at.desc&limit=20"),
      approvals: select("approval_queue", "select=id,title,decision,context,recommendation,impact,options,status,priority,due_at,requested_at,resolved_at,source_event_id,updated_at&order=priority.asc,requested_at.desc&limit=20"),
      automations: select("automation_runs", "select=id,workflow_name,status,trigger_type,started_at,finished_at,rows_read,rows_written,rows_skipped,error_message,evidence,created_at&order=started_at.desc&limit=10"),
      events: select("source_events", "select=id,source_system,external_id,event_type,title,summary,confidence,processing_status,occurred_at,captured_at,processed_at&order=captured_at.desc&limit=30"),
    };

    const entries = await Promise.all(Object.entries(requests).map(async ([name, promise]) => {
      try {
        return [name, await promise, null];
      } catch (error) {
        if (Number(error?.status) === 401 || Number(error?.status) === 403) throw error;
        return [name, [], error instanceof Error ? error.message : `Could not read ${name}`];
      }
    }));

    const data = Object.fromEntries(entries.map(([name, rows]) => [name, rows]));
    const sourceErrors = Object.fromEntries(entries.filter(([, , error]) => error).map(([name, , error]) => [name, error]));
    const projects = safeRows(data.projects);
    const tasks = safeRows(data.tasks);
    const connectors = safeRows(data.connectors);
    const inbox = safeRows(data.inbox).filter((item) => openStatus(item.status));
    const approvals = safeRows(data.approvals).filter((item) => openStatus(item.status));
    const events = safeRows(data.events);
    const automations = safeRows(data.automations);
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const openTasks = tasks.filter((task) => openStatus(task.status)).map((task) => ({
      ...task,
      project_name: projectById.get(task.project_id)?.name || null,
    }));
    const featuredProject = projects.find((project) => project.is_featured && openStatus(project.status))
      || projects.find((project) => openStatus(project.status))
      || null;
    const nextTask = openTasks[0] || null;
    const today = indiaDayKey();
    const calendarEvents = events.filter((event) => {
      if (!String(event.source_system || "").toLowerCase().includes("calendar")) return false;
      const timestamp = event.occurred_at || event.captured_at;
      return timestamp ? indiaDayKey(Date.parse(timestamp)) === today : false;
    });
    const recentEvents = events.slice(0, 8);
    const latestSourceAt = newestTimestamp(
      [...projects, ...tasks, ...connectors, ...inbox, ...approvals, ...automations, ...events],
      ["last_verified_at", "last_checked_at", "last_success_at", "occurred_at", "captured_at", "started_at", "updated_at", "created_at"],
    );
    const sourceFreshness = freshness(latestSourceAt);
    const connectorHealth = connectors.map((connector) => ({
      ...connector,
      freshness: freshness(connector.last_checked_at || connector.last_success_at || connector.updated_at),
    }));

    return {
      generatedAt: new Date().toISOString(),
      latestSourceAt,
      sourceFreshness,
      sourceErrors,
      mainHighlight: featuredProject ? {
        title: featuredProject.name,
        summary: featuredProject.summary,
        status: featuredProject.status,
        progress: featuredProject.progress,
        phase: featuredProject.current_phase,
        sourceName: featuredProject.source_name,
        sourceUrl: featuredProject.source_url,
        verifiedAt: featuredProject.last_verified_at,
      } : null,
      nextAction: featuredProject?.next_action || nextTask?.title || null,
      blocker: featuredProject?.blocker || nextTask?.description || null,
      projects,
      openTasks,
      approvals,
      inbox,
      calendarEvents,
      recentEvents,
      automations,
      connectors: connectorHealth,
      counts: {
        activeProjects: projects.filter((project) => openStatus(project.status)).length,
        openTasks: openTasks.length,
        pendingApprovals: approvals.length,
        inboxItems: inbox.length,
        staleConnectors: connectorHealth.filter((connector) => connector.freshness.state === "stale" || connector.freshness.state === "unknown").length,
      },
    };
  }

  return { readToday };
}

export { freshness as classifySourceFreshness };
