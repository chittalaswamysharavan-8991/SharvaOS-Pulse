import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("timeline and detail history expose delete log controls", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function removeLog\(entry: LogEntry\)/);
  assert.match(page, /persist\(\{ action: "delete_log", id: entry\.id \}\)/);
  assert.match(page, /aria-label=\{`Delete \$\{entry\.label\}`\}/);
  assert.match(page, /window\.confirm\(`Delete \$\{entry\.label\}\?`\)/);
});
