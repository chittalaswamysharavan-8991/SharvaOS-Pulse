import assert from "node:assert/strict";
import test from "node:test";
import { createNotionCaptureAdapter, validateCapture } from "../lib/notion-capture.mjs";

const good = {
  captureType: "water",
  operationId: "pulse-test-001",
  eventTime: "2026-08-02T10:00:00.000Z",
  eventTimeBasis: "CAPTURE_TIME",
  logicalDate: "2026-08-02",
  fields: { amountMl: 500, context: "morning" },
};

test("validates live field names and rejects privacy/schema gates", () => {
  assert.equal(validateCapture(good).type, "water");
  assert.throws(() => validateCapture({ ...good, captureType: "smoking" }), /privacy decision/);
  assert.throws(() => validateCapture({ ...good, captureType: "tasks" }), /My Tasks/);
  assert.throws(() => validateCapture({ ...good, fields: { amount: 500 } }), /Unsupported fields/);
  assert.throws(() => validateCapture({ ...good, fields: { amountMl: 1 } }), /numeric/);
});

test("creates a domain page and Daily Evidence, then verifies both by read-back", async () => {
  const calls = [];
  let pages = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes("/data_sources/") && url.endsWith("/query")) {
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    }
    if (url.endsWith("/pages")) {
      pages += 1;
      return { ok: true, status: 200, json: async () => ({ id: `page-${pages}`, url: `https://notion.local/page-${pages}` }) };
    }
    const id = url.split("/").pop();
    const properties = id === "page-1"
      ? { "Water Entry": { type: "title", title: [{ plain_text: "Water: 500 ml" }] }, "Amount ml": { type: "number", number: 500 }, "Logical Date": { type: "date", date: { start: "2026-08-02" } } }
      : { "Evidence ID": { type: "title", title: [{ plain_text: "Pulse capture pulse-test-001" }] }, "Operation ID": { type: "rich_text", rich_text: [{ plain_text: "pulse-test-001" }] }, "Verification State": { type: "select", select: { name: "VERIFIED" } }, "Persistence Result": { type: "select", select: { name: "VERIFIED_PERSISTED" } } };
    return { ok: true, status: 200, json: async () => ({ id, url: `https://notion.local/${id}`, parent: { data_source_id: id === "page-1" ? "dbe85776-d489-4719-b979-456dfa6a60b7" : "a428d124-2289-4193-a69c-fe91d29e3a63" }, properties }) };
  };
  const result = await createNotionCaptureAdapter("secret-test", fetchImpl).capture(good);
  assert.equal(result.status, "Verified");
  assert.equal(result.verified, true);
  assert.equal(result.readBack, true);
  assert.equal(calls.length, 5);
  assert.equal(calls.some((call) => JSON.stringify(call.init?.body || "").includes("secret-test")), false);
  assert.equal(calls.some((call) => call.init.headers["Notion-Version"] === "2026-03-11"), true);
});

test("replays the same operation without creating a second domain page", async () => {
  let queryCount = 0;
  let createCount = 0;
  let domainId = "";
  const fetchImpl = async (url) => {
    if (url.includes("/data_sources/") && url.endsWith("/query")) {
      queryCount += 1;
      return { ok: true, status: 200, json: async () => ({ results: queryCount === 1 ? [] : [{ id: "evidence-existing" }] }) };
    }
    if (url.endsWith("/pages")) {
      createCount += 1;
      const id = createCount === 1 ? "domain-new" : "evidence-new";
      if (createCount === 1) domainId = id;
      return { ok: true, status: 200, json: async () => ({ id, url: `https://notion.local/${id}` }) };
    }
    const id = url.split("/").pop();
    if (id === domainId) return { ok: true, status: 200, json: async () => ({ id, parent: { data_source_id: "dbe85776-d489-4719-b979-456dfa6a60b7" }, properties: { "Water Entry": { type: "title", title: [{ plain_text: "Water: 500 ml" }] }, "Amount ml": { type: "number", number: 500 }, "Logical Date": { type: "date", date: { start: "2026-08-02" } } } }) };
    return { ok: true, status: 200, json: async () => ({ id, properties: { "Operation ID": { type: "rich_text", rich_text: [{ plain_text: "pulse-test-001" }] }, "Verification State": { type: "select", select: { name: "VERIFIED" } }, "Persistence Result": { type: "select", select: { name: "VERIFIED_PERSISTED" } } } }) };
  };
  const adapter = createNotionCaptureAdapter("secret-test", fetchImpl);
  await adapter.capture(good);
  const replay = await adapter.capture(good);
  assert.equal(replay.state, "already_captured");
  assert.equal(replay.verified, true);
  assert.equal(createCount, 2);
});

test("bounds rate-limit retry and exposes actionable Notion errors", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return { ok: false, status: 429, headers: { get: () => "0" }, json: async () => ({}) };
  };
  await assert.rejects(() => createNotionCaptureAdapter("secret-test", fetchImpl).capture(good), (error) => error.code === "NOTION_RATE_LIMITED" && error.status === 503);
  assert.equal(attempts, 3);
});

test("does not log or return the Notion secret", async () => {
  const adapter = createNotionCaptureAdapter("secret-test", async () => ({ ok: false, status: 401, json: async () => ({}) }));
  await assert.rejects(() => adapter.capture(good), (error) => error.code === "NOTION_UNAUTHORIZED" && !error.message.includes("secret-test"));
});
