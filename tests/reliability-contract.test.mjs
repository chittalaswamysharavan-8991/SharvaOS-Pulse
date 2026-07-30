import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const apiRoute = await readFile(new URL("../app/api/day/route.ts", import.meta.url), "utf8");
const mcpRoute = await readFile(new URL("../app/mcp/route.ts", import.meta.url), "utf8");
const dbModule = await readFile(new URL("../db/index.ts", import.meta.url), "utf8");

test("request handlers never run schema DDL", () => {
  assert.doesNotMatch(apiRoute, /ensureSchema|CREATE TABLE/i);
  assert.doesNotMatch(mcpRoute, /ensureSchema|CREATE TABLE/i);
  assert.doesNotMatch(dbModule, /CREATE TABLE/i);
});

test("HTTP writes return authoritative read-back confirmation", () => {
  assert.match(apiRoute, /confirmation: \{ \.\.\.confirmation, confirmed: true \}/);
  assert.match(apiRoute, /day: await readDay/);
  assert.match(apiRoute, /Log write could not be confirmed/);
  assert.match(apiRoute, /Task update could not be confirmed/);
});

test("import reads loggedAt rather than replacing it with request time", () => {
  assert.match(apiRoute, /normalizeImportedLog/);
  assert.doesNotMatch(apiRoute, /row\.timestamp/);
});

test("MCP writes verify persisted records", () => {
  assert.match(mcpRoute, /version: "2\.1\.0"/);
  assert.match(mcpRoute, /confirmed: true/);
  assert.match(mcpRoute, /write could not be confirmed/);
});
