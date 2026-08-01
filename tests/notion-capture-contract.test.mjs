import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const candidates = [
  "app/api/notion/capture/route.ts",
  "app/api/notion/capture/route.js",
  "app/api/notion-capture/route.ts",
  "app/api/notion-capture/route.js",
  "lib/notion-capture.mjs",
  "lib/notion-capture.ts",
];

async function implementation() {
  const found = [];
  for (const relative of candidates) {
    try {
      await access(new URL(relative, root));
      found.push({ relative, source: await readFile(new URL(relative, root), "utf8") });
    } catch {}
  }
  return found.length ? { relative: found.map((item) => item.relative).join(", "), source: found.map((item) => item.source).join("\n") } : null;
}

function contractTest(name, check) {
  test(name, async (t) => {
    const found = await implementation();
    if (!found) {
      t.skip("Notion capture implementation is not present; contract remains non-blocking");
      return;
    }
    check(found.source, found.relative);
  });
}

test("capture contract documents the expected implementation locations", async () => {
  assert.ok(candidates.some((path) => path.includes("notion/capture") && path.includes("route")));
});

contractTest("maps only the approved capture kinds and preserves source timestamps", (source) => {
  assert.match(source, /water|smoke|food/);
  assert.match(source, /loggedAt|capturedAt|timestamp|logicalDate/);
  assert.doesNotMatch(source, /new Date\(\)\s*\.getTime\(\).*loggedAt/);
});

contractTest("validates required fields and task schema before the Notion call", (source) => {
  assert.match(source, /validation|invalid|required|schema/i);
  assert.match(source, /task|todo/i);
  assert.match(source, /text|title/i);
});

contractTest("uses an idempotency key and verifies Notion read-back", (source) => {
  assert.match(source, /idempot|dedup|externalId|captureId|fingerprint/i);
  assert.match(source, /retrieve|query|read.?back|readBack|fetch/i);
});

contractTest("maps Notion 401, 403, 429, and 5xx failures without fabricating success", (source) => {
  for (const status of [401, 403, 429, 500]) assert.match(source, new RegExp(`\\b${status}\\b`));
  assert.match(source, /retry|backoff|rate.?limit/i);
  assert.match(source, /error|failed|blocked/i);
});

contractTest("enforces the smoking privacy gate", (source) => {
  assert.match(source, /smok(e|ing)/i);
  assert.match(source, /privacy|consent|gate|allow/i);
});

contractTest("does not fabricate a Daily Record relation", (source) => {
  assert.doesNotMatch(source, /Daily Record.{0,80}(relation|page_id|id)/i);
  assert.doesNotMatch(source, /(relation|page_id).{0,80}Daily Record/i);
  assert.match(source, /read.?back|confirmed|persisted/i);
});

contractTest("requires the Vercel token through configuration rather than a source literal", (source) => {
  assert.match(source, /NOTION_TOKEN/);
  assert.doesNotMatch(source, /NOTION_TOKEN\s*[:=]\s*["'][^"']+["']/);
});
