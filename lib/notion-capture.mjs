const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";
const TIME_ZONE = "Asia/Kolkata";

export const NOTION_DATA_SOURCES = Object.freeze({
  water: "collection://dbe85776-d489-4719-b979-456dfa6a60b7",
  food: "collection://ccc83b12-93b2-4fce-ae2a-0ceb693fcceb",
  sleep: "collection://6d93bb50-c05d-4058-94af-f57efe9f374f",
  habits: "collection://d23800fd-81ae-4aa1-9bdb-7343556af922",
  spending: "collection://52e709e8-e3d4-4123-9bbf-fbb14aff6dcb",
  body: "collection://a08e7825-8e5f-4e35-b8d9-7dd1d6c0a569",
  evidence: "collection://a428d124-2289-4193-a69c-fe91d29e3a63",
  dailyRecords: "collection://1ea36926-113f-4fb8-8af9-d077a18249db",
});

const ids = Object.fromEntries(Object.entries(NOTION_DATA_SOURCES).map(([key, value]) => [
  key,
  value.replace(/^collection:\/\//, ""),
]));

const OPTIONS = Object.freeze({
  mealType: ["Breakfast", "Lunch", "Dinner", "Snack", "Drink", "Other"],
  sleepType: ["Main Sleep", "Nap", "Other"],
  expenseCategory: ["Food", "Smoke", "Travel", "Health", "Shopping", "Bills", "Other"],
  paymentMethod: ["Cash", "UPI", "Card", "Bank Transfer", "Other"],
  movementType: ["Daily Snapshot", "Walk", "Exercise", "Heart Rate", "Weight", "Other"],
});

const DEFINITIONS = Object.freeze({
  water: {
    label: "SharvaOS — Water Log",
    dataSourceId: ids.water,
    titleProperty: "Water Entry",
    fields: {
      amountMl: { kind: "number", required: true, min: 50, max: 2000, integer: true },
      context: { kind: "text" },
      notes: { kind: "text" },
    },
  },
  food: {
    label: "SharvaOS — Food Log",
    dataSourceId: ids.food,
    titleProperty: "Food Entry",
    fields: {
      foodItems: { kind: "text", required: true },
      mealType: { kind: "select", options: OPTIONS.mealType, required: true },
      quantityOrPortion: { kind: "text" },
      notes: { kind: "text" },
      locationNotes: { kind: "text" },
      peopleNotes: { kind: "text" },
    },
  },
  sleep: {
    label: "SharvaOS — Sleep Log",
    dataSourceId: ids.sleep,
    titleProperty: "Sleep Entry",
    fields: {
      sleepType: { kind: "select", options: OPTIONS.sleepType, required: true },
      durationMinutes: { kind: "number", required: true, min: 1, max: 1440, integer: true },
      startedAt: { kind: "datetime" },
      endedAt: { kind: "datetime" },
      device: { kind: "text" },
      notes: { kind: "text" },
    },
  },
  expense: {
    label: "SharvaOS — Daily Spending Log",
    dataSourceId: ids.spending,
    titleProperty: "Spending Entry",
    fields: {
      amountInr: { kind: "number", required: true, min: 0.01, max: 100000000 },
      category: { kind: "select", options: OPTIONS.expenseCategory, required: true },
      merchantOrPlace: { kind: "text" },
      paymentMethod: { kind: "select", options: OPTIONS.paymentMethod },
      accountOrSource: { kind: "text" },
      paidAt: { kind: "datetime" },
      notes: { kind: "text" },
    },
  },
  movement: {
    label: "SharvaOS — Body & Movement Log",
    dataSourceId: ids.body,
    titleProperty: "Body Entry",
    fields: {
      entryType: { kind: "select", options: OPTIONS.movementType, required: true },
      durationMinutes: { kind: "number", min: 0, max: 1440, integer: true },
      steps: { kind: "number", min: 0, max: 100000 },
      distanceKm: { kind: "number", min: 0, max: 1000 },
      caloriesKcal: { kind: "number", min: 0, max: 100000 },
      averageHr: { kind: "number", min: 0, max: 300 },
      device: { kind: "text" },
      notes: { kind: "text" },
    },
  },
});

export class NotionCaptureError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = "NotionCaptureError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validDateTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeType(input) {
  return typeof input.captureType === "string" ? input.captureType.trim().toLowerCase() :
    typeof input.type === "string" ? input.type.trim().toLowerCase() : "";
}

export function validateCapture(input) {
  if (!isObject(input)) throw new NotionCaptureError("INVALID_REQUEST", "Request body must be an object");
  const type = normalizeType(input);
  if (type === "smoking" || type === "smoke") {
    throw new NotionCaptureError("PRIVACY_GATE", "Smoking capture is disabled by the accepted local-only privacy decision", 403);
  }
  if (type === "tasks" || type === "task" || type === "todo") {
    throw new NotionCaptureError("SCHEMA_UNAVAILABLE", "The My Tasks data-source schema is not available to the app", 422);
  }
  const definition = DEFINITIONS[type];
  if (!definition) throw new NotionCaptureError("UNSUPPORTED_TYPE", "Capture type is not supported", 422);

  const operationId = cleanText(input.operationId);
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(operationId)) {
    throw new NotionCaptureError("INVALID_OPERATION", "operationId must be 8-160 safe characters", 422);
  }
  if (!validDate(input.logicalDate)) {
    throw new NotionCaptureError("INVALID_DATE", `logicalDate must be a valid ${TIME_ZONE} calendar date`, 422);
  }
  if (!validDateTime(input.eventTime)) {
    throw new NotionCaptureError("INVALID_EVENT_TIME", "eventTime must be an ISO date-time", 422);
  }
  const eventTimeBasis = input.eventTimeBasis || "CAPTURE_TIME";
  if (!["USER_STATED", "CAPTURE_TIME"].includes(eventTimeBasis)) {
    throw new NotionCaptureError("INVALID_EVENT_TIME_BASIS", "eventTimeBasis must be USER_STATED or CAPTURE_TIME", 422);
  }
  if (!isObject(input.fields)) throw new NotionCaptureError("INVALID_FIELDS", "fields must be an object", 422);

  const fields = input.fields;
  const allowed = new Set(Object.keys(definition.fields));
  const unknown = Object.keys(fields).filter((key) => !allowed.has(key));
  if (unknown.length) throw new NotionCaptureError("INVALID_FIELDS", `Unsupported fields: ${unknown.join(", ")}`, 422);

  for (const [key, spec] of Object.entries(definition.fields)) {
    const value = fields[key];
    if (value === undefined || value === null || value === "") {
      if (spec.required) throw new NotionCaptureError("INVALID_FIELDS", `Required field missing: ${key}`, 422);
      continue;
    }
    if (spec.kind === "text" && !nonEmpty(value)) throw new NotionCaptureError("INVALID_FIELDS", `Invalid field: ${key}`, 422);
    if (spec.kind === "number" && (typeof value !== "number" || !Number.isFinite(value) || value < spec.min || value > spec.max || (spec.integer && !Number.isInteger(value)))) {
      throw new NotionCaptureError("INVALID_FIELDS", `Invalid numeric field: ${key}`, 422);
    }
    if (spec.kind === "select" && !spec.options.includes(value)) {
      throw new NotionCaptureError("INVALID_FIELDS", `Invalid option for ${key}: ${value}`, 422);
    }
    if (spec.kind === "datetime" && !validDateTime(value)) {
      throw new NotionCaptureError("INVALID_FIELDS", `Invalid date-time field: ${key}`, 422);
    }
  }

  return {
    type,
    operationId,
    logicalDate: input.logicalDate,
    eventTime: input.eventTime,
    eventTimeBasis,
    fields: { ...fields },
    definition,
  };
}

function title(value) {
  return { title: [{ type: "text", text: { content: String(value).slice(0, 2000) } }] };
}

function richText(value) {
  const text = cleanText(value);
  return text ? { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] } : null;
}

function select(name) {
  return { select: { name } };
}

function number(value) {
  return { number: value };
}

function date(start) {
  return { date: { start } };
}

function checkbox(value) {
  return { checkbox: Boolean(value) };
}

function addText(properties, key, value) {
  const property = richText(value);
  if (property) properties[key] = property;
}

function addNumber(properties, key, value) {
  if (value !== undefined && value !== null && value !== "") properties[key] = number(value);
}

function addDate(properties, key, value) {
  if (value) properties[key] = date(value);
}

function commonProperties(record, titleValue) {
  return {
    [record.definition.titleProperty]: title(titleValue),
    "Logical Date": date(record.logicalDate),
    Source: select("Manual"),
    "Evidence Status": select("USER_REPORTED"),
  };
}

export function buildDomainProperties(record) {
  const f = record.fields;
  const properties = commonProperties(record, (() => {
    if (record.type === "water") return `Water: ${f.amountMl} ml`;
    if (record.type === "food") return `Food: ${f.foodItems}`;
    if (record.type === "sleep") return `Sleep: ${f.durationMinutes} minutes`;
    if (record.type === "expense") return `Expense: INR ${f.amountInr}`;
    return `Movement: ${f.entryType}`;
  })());

  if (record.type === "water") {
    addNumber(properties, "Amount ml", f.amountMl);
    addText(properties, "Context", f.context);
    addText(properties, "Notes", f.notes);
    addDate(properties, "Recorded At", record.eventTime);
  }
  if (record.type === "food") {
    addText(properties, "Food Items", f.foodItems);
    properties["Meal Type"] = select(f.mealType);
    addText(properties, "Quantity or Portion", f.quantityOrPortion);
    addText(properties, "Notes", f.notes);
    addText(properties, "Location Notes", f.locationNotes);
    addText(properties, "People Notes", f.peopleNotes);
    addDate(properties, "Recorded At", record.eventTime);
  }
  if (record.type === "sleep") {
    properties["Sleep Type"] = select(f.sleepType);
    addDate(properties, "Started At", f.startedAt);
    addDate(properties, "Ended At", f.endedAt);
    addNumber(properties, "Duration Minutes", f.durationMinutes);
    addText(properties, "Device", f.device);
    addText(properties, "Notes", f.notes);
  }
  if (record.type === "expense") {
    addNumber(properties, "Amount INR", f.amountInr);
    properties.Category = select(f.category);
    addText(properties, "Merchant or Place", f.merchantOrPlace);
    if (f.paymentMethod) properties["Payment Method"] = select(f.paymentMethod);
    addText(properties, "Account or Source", f.accountOrSource);
    addDate(properties, "Paid At", f.paidAt || record.eventTime);
    addText(properties, "Notes", f.notes);
    properties.Sensitive = checkbox(true);
  }
  if (record.type === "movement") {
    properties["Entry Type"] = select(f.entryType);
    addNumber(properties, "Steps", f.steps);
    addNumber(properties, "Duration Minutes", f.durationMinutes);
    addNumber(properties, "Distance km", f.distanceKm);
    addNumber(properties, "Calories kcal", f.caloriesKcal);
    addNumber(properties, "Average HR", f.averageHr);
    addDate(properties, "Recorded At", record.eventTime);
    addText(properties, "Device", f.device);
    addText(properties, "Notes", f.notes);
  }
  return properties;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).sort().join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

async function fingerprint(record) {
  const payload = canonicalJson({
    type: record.type,
    operationId: record.operationId,
    logicalDate: record.logicalDate,
    eventTime: record.eventTime,
    fields: record.fields,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function buildEvidenceProperties(record, domainPage, fingerprintValue, verifiedAt = new Date().toISOString()) {
  const properties = {
    "Evidence ID": title(`Pulse capture ${record.operationId}`),
    "Evidence Summary": richText(`Verified ${record.type} capture for logical date ${record.logicalDate}`),
    "Source Type": select("User Capture"),
    "Evidence Role": select("WRITE_PROOF"),
    "Verification State": select("VERIFIED"),
    "Persistence Result": select("VERIFIED_PERSISTED"),
    "Captured At": date(verifiedAt),
    "Event Time": date(record.eventTime),
    "Event Time Basis": select(record.eventTimeBasis),
    "Capture Policy": select("EXPLICIT_WRITE_ONLY"),
    "Source Reference": richText(domainPage.url || domainPage.id),
    "Operation ID": richText(record.operationId),
    "Read-back Verified At": date(verifiedAt),
    "Sensitive Content Flag": checkbox(record.type === "expense"),
    "Approximate Timestamp Flag": checkbox(false),
  };
  addText(properties, "Recovery Batch ID", `pulse:${fingerprintValue}`);
  return properties;
}

function plainTextFromProperty(property) {
  if (!property) return "";
  if (property.type === "title") return (property.title || []).map((item) => item.plain_text || item.text?.content || "").join("");
  if (property.type === "rich_text") return (property.rich_text || []).map((item) => item.plain_text || item.text?.content || "").join("");
  return "";
}

function readProperty(page, name) {
  return page?.properties?.[name];
}

function propertyValue(property) {
  if (!property) return undefined;
  if (property.type === "number") return property.number;
  if (property.type === "select") return property.select?.name;
  if (property.type === "date") return property.date?.start;
  if (property.type === "checkbox") return property.checkbox;
  return plainTextFromProperty(property);
}

function assertPageReadBack(page, record) {
  const expectedSource = record.definition.dataSourceId;
  const actualSource = page?.parent?.data_source_id || page?.parent?.database_id;
  if (!page?.id || (actualSource && actualSource !== expectedSource)) {
    throw new NotionCaptureError("READ_BACK_FAILED", "Notion domain write was not returned from the expected data source", 502);
  }
  const titleValue = plainTextFromProperty(readProperty(page, record.definition.titleProperty));
  if (!titleValue) throw new NotionCaptureError("READ_BACK_FAILED", "Notion domain title was not read back", 502);
  const logicalDate = readProperty(page, "Logical Date")?.date?.start;
  if (logicalDate && logicalDate !== record.logicalDate) throw new NotionCaptureError("READ_BACK_FAILED", "Notion logical date did not match the capture", 502);

  const expected = record.type === "water"
    ? [["Amount ml", record.fields.amountMl]]
    : record.type === "food"
      ? [["Food Items", record.fields.foodItems], ["Meal Type", record.fields.mealType]]
      : record.type === "sleep"
        ? [["Sleep Type", record.fields.sleepType], ["Duration Minutes", record.fields.durationMinutes]]
        : record.type === "expense"
          ? [["Amount INR", record.fields.amountInr], ["Category", record.fields.category]]
          : [["Entry Type", record.fields.entryType], ...(record.fields.durationMinutes === undefined ? [] : [["Duration Minutes", record.fields.durationMinutes]])];
  for (const [propertyName, expectedValue] of expected) {
    if (propertyValue(readProperty(page, propertyName)) !== expectedValue) {
      throw new NotionCaptureError("READ_BACK_FAILED", `Notion property did not match the capture: ${propertyName}`, 502);
    }
  }
}

function assertEvidenceReadBack(page, record) {
  if (!page?.id) throw new NotionCaptureError("EVIDENCE_READ_BACK_FAILED", "Daily Evidence write was not confirmed", 502);
  const operationId = plainTextFromProperty(readProperty(page, "Operation ID"));
  const verification = readProperty(page, "Verification State")?.select?.name;
  const persistence = readProperty(page, "Persistence Result")?.select?.name;
  if (operationId !== record.operationId || verification !== "VERIFIED" || persistence !== "VERIFIED_PERSISTED") {
    throw new NotionCaptureError("EVIDENCE_READ_BACK_FAILED", "Daily Evidence did not confirm the exact operation", 502);
  }
}

function responseMessage(payload) {
  return payload?.message || payload?.error?.message || payload?.error || "Notion request failed";
}

function errorForStatus(status, payload) {
  if (status === 401) return new NotionCaptureError("NOTION_UNAUTHORIZED", "Notion integration authentication failed", 401);
  if (status === 403) return new NotionCaptureError("NOTION_FORBIDDEN", "Notion integration lacks access to the approved data source", 403);
  if (status === 404) return new NotionCaptureError("NOTION_NOT_FOUND", "Approved Notion data source or page was not found", 502);
  if (status === 409) return new NotionCaptureError("NOTION_CONFLICT", responseMessage(payload), 409);
  if (status === 429) return new NotionCaptureError("NOTION_RATE_LIMITED", "Notion rate limit remained after bounded retries", 503);
  if (status >= 500) return new NotionCaptureError("NOTION_UNAVAILABLE", "Notion was unavailable after bounded retries", 503);
  return new NotionCaptureError("NOTION_API_ERROR", responseMessage(payload), 502);
}

export function createNotionCaptureAdapter(token, fetchImpl = globalThis.fetch) {
  if (!token || typeof token !== "string") throw new NotionCaptureError("NOT_CONFIGURED", "NOTION_TOKEN is not configured", 503);
  if (typeof fetchImpl !== "function") throw new NotionCaptureError("NOT_CONFIGURED", "Notion fetch implementation is unavailable", 503);

  async function call(path, init = {}, attempt = 0) {
    let response;
    try {
      response = await fetchImpl(`${NOTION_API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
      });
    } catch {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        return call(path, init, attempt + 1);
      }
      throw new NotionCaptureError("NOTION_UNAVAILABLE", "Notion could not be reached", 503);
    }
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload;
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retryAfter = Number(response.headers?.get?.("retry-after") || 0);
      const wait = Math.min(500, Math.max(50, retryAfter * 1000 || 50 * (attempt + 1)));
      await new Promise((resolve) => setTimeout(resolve, wait));
      return call(path, init, attempt + 1);
    }
    throw errorForStatus(response.status, payload);
  }

  async function queryEvidence(operationId) {
    return call(`/data_sources/${ids.evidence}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 10,
        filter: { property: "Operation ID", rich_text: { equals: operationId } },
      }),
    });
  }

  return {
    async capture(input) {
      const record = validateCapture(input);
      const fingerprintValue = await fingerprint(record);
      const prior = await queryEvidence(record.operationId);
      if (Array.isArray(prior.results) && prior.results.length) {
        const existing = await call(`/pages/${prior.results[0].id}`);
        assertEvidenceReadBack(existing, record);
        return {
          state: "already_captured",
          status: "Verified",
          verified: true,
          confirmed: true,
          operationId: record.operationId,
          fingerprint: fingerprintValue,
          pageId: plainTextFromProperty(readProperty(existing, "Source Reference")) || null,
          evidencePageId: existing.id,
          readBack: true,
          destination: record.definition.label,
        };
      }

      const domainPage = await call("/pages", {
        method: "POST",
        body: JSON.stringify({
          parent: { data_source_id: record.definition.dataSourceId },
          properties: buildDomainProperties(record),
        }),
      });
      const domainReadBack = await call(`/pages/${domainPage.id}`);
      assertPageReadBack(domainReadBack, record);

      const verifiedAt = new Date().toISOString();
      const evidencePage = await call("/pages", {
        method: "POST",
        body: JSON.stringify({
          parent: { data_source_id: ids.evidence },
          properties: buildEvidenceProperties(record, domainReadBack, fingerprintValue, verifiedAt),
        }),
      });
      const evidenceReadBack = await call(`/pages/${evidencePage.id}`);
      assertEvidenceReadBack(evidenceReadBack, record);

      return {
        state: "captured",
        status: "Verified",
        verified: true,
        confirmed: true,
        operationId: record.operationId,
        fingerprint: fingerprintValue,
        pageId: domainReadBack.id,
        pageUrl: domainReadBack.url || null,
        evidencePageId: evidenceReadBack.id,
        evidenceUrl: evidenceReadBack.url || null,
        readBack: true,
        destination: record.definition.label,
      };
    },
  };
}
