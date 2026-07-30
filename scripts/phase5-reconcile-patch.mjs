import { readFile, writeFile, rm } from 'node:fs/promises';

async function patch(path, transform) {
  const source = await readFile(path, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`No change applied to ${path}`);
  await writeFile(path, next);
}

await patch('lib/pulse-transport.mjs', (source) => {
  const anchor = `function boundedBatchImportId(importId, index) {\n  const suffix = \`:batch:\${index}\`;\n  const base = String(importId).slice(0, MAX_IMPORT_ID_LENGTH - suffix.length);\n  return \`\${base}\${suffix}\`;\n}\n`;
  const addition = `${anchor}\nfunction importSeed(day) {\n  const value = dayFrom(day);\n  const logs = value.logs.map((entry) => JSON.stringify([\n    text(entry?.id), text(entry?.kind), text(entry?.label), text(entry?.detail),\n    number(entry?.amount), number(entry?.loggedAt),\n  ])).sort();\n  const todos = value.todos.map((entry) => JSON.stringify([\n    text(entry?.id), text(entry?.text), Boolean(entry?.done), number(entry?.createdAt),\n  ])).sort();\n  return JSON.stringify([logs, todos]);\n}\n\nfunction shortHash(value) {\n  let hash = 2166136261;\n  for (let index = 0; index < value.length; index += 1) {\n    hash ^= value.charCodeAt(index);\n    hash = Math.imul(hash, 16777619);\n  }\n  return (hash >>> 0).toString(16).padStart(8, \"0\");\n}\n\nexport function createInitialImportId(date, day) {\n  if (!validDate(date)) throw new TypeError(\"Valid date required\");\n  return \`device-initial:\${date}:\${shortHash(importSeed(day))}\`;\n}\n\nexport async function reconcileMissingDay({ transport, date, missing }) {\n  if (!transport || typeof transport.importDay !== \"function\" || typeof transport.readDay !== \"function\") {\n    throw new TypeError(\"Pulse transport required\");\n  }\n  const importId = createInitialImportId(date, missing);\n  try {\n    return { day: await transport.importDay(date, missing, importId), conflict: false, importId };\n  } catch (error) {\n    const status = error && typeof error === \"object\" ? Number(error.status) || 0 : 0;\n    if (transport.owner === \"supabase\" && status === 409) {\n      return { day: await transport.readDay(date), conflict: true, importId };\n    }\n    throw error;\n  }\n}\n`;
  if (!source.includes(anchor)) throw new Error('transport anchor missing');
  source = source.replace(anchor, addition);
  source = source.replace('async importDay(date, day, importId = `device-initial:${date}`) {', 'async importDay(date, day, importId = createInitialImportId(date, day)) {');
  return source;
});

await patch('lib/pulse-transport.d.mts', (source) => {
  const anchor = 'export function selectMissingDayEntries(localDay: PulseDay, remoteDay: PulseDay): PulseDay;\n';
  const addition = `${anchor}export function createInitialImportId(date: string, day: PulseDay): string;\nexport function reconcileMissingDay(input: { transport: PulseTransport; date: string; missing: PulseDay }): Promise<{ day: PulseDay; conflict: boolean; importId: string }>;\n`;
  if (!source.includes(anchor)) throw new Error('declaration anchor missing');
  return source.replace(anchor, addition);
});

await patch('app/page.tsx', (source) => {
  source = source.replace(
    '  createCanonicalPulseTransport,\n  createD1PulseTransport,\n  selectMissingDayEntries,',
    '  createCanonicalPulseTransport,\n  createD1PulseTransport,\n  reconcileMissingDay,\n  selectMissingDayEntries,',
  );
  const anchor = '  }, [date, requireSignIn, savePending]);\n\n  useEffect(() => {';
  const addition = `  }, [date, requireSignIn, savePending]);\n\n  const reconcileMissing = useCallback(async (transport: PulseTransport, missing: DayState) => {\n    const result = await reconcileMissingDay({ transport, date, missing });\n    if (result.conflict) setToast(\"Canonical version kept · stale device copy skipped\");\n    return result.day as DayState;\n  }, [date]);\n\n  useEffect(() => {`;
  if (!source.includes(anchor)) throw new Error('page callback anchor missing');
  source = source.replace(anchor, addition);
  source = source.replace(
    'await activeTransport.importDay(date, missingAfterQueue, `device-initial:${date}`) as DayState',
    'await reconcileMissing(activeTransport, missingAfterQueue)',
  );
  source = source.replace(
    'await activeTransport.importDay(date, missingCached, `device-initial:${date}`) as DayState',
    'await reconcileMissing(activeTransport, missingCached)',
  );
  source = source.replace(
    '  }, [date, flushPending, pendingKey, requireSignIn, runtimeReady, storageKey, transportVersion]);',
    '  }, [date, flushPending, pendingKey, reconcileMissing, requireSignIn, runtimeReady, storageKey, transportVersion]);',
  );
  return source;
});

await writeFile('tests/phase5-reconciliation-conflict.test.mjs', `import assert from "node:assert/strict";\nimport test from "node:test";\nimport { createInitialImportId, reconcileMissingDay } from "../lib/pulse-transport.mjs";\n\nconst date = "2026-07-30";\nconst base = { logs: [{ id: "11111111-1111-4111-8111-111111111111", kind: "water", label: "250 ml water", detail: "Hydration", amount: 250, loggedAt: 1785431984900 }], todos: [] };\n\ntest("initial import IDs are stable for the same payload and change with payload", () => {\n  const first = createInitialImportId(date, base);\n  const replay = createInitialImportId(date, structuredClone(base));\n  const changed = createInitialImportId(date, { ...base, logs: [{ ...base.logs[0], amount: 500, label: "500 ml water" }] });\n  assert.equal(first, replay);\n  assert.notEqual(first, changed);\n  assert.ok(first.length <= 80);\n});\n\ntest("canonical 409 keeps a fresh authoritative day", async () => {\n  const canonical = { logs: [], todos: [] };\n  const transport = {\n    owner: "supabase",\n    async importDay() { const error = new Error("conflict"); error.status = 409; throw error; },\n    async readDay() { return canonical; },\n  };\n  const result = await reconcileMissingDay({ transport, date, missing: base });\n  assert.equal(result.conflict, true);\n  assert.deepEqual(result.day, canonical);\n});\n\ntest("non-conflict import failures still propagate", async () => {\n  const transport = {\n    owner: "supabase",\n    async importDay() { const error = new Error("offline"); error.status = 503; throw error; },\n    async readDay() { throw new Error("should not read"); },\n  };\n  await assert.rejects(() => reconcileMissingDay({ transport, date, missing: base }), /offline/);\n});\n`);

await rm('scripts/phase5-reconcile-patch.mjs');
await rm('.github/workflows/phase5-reconcile-patch.yml');
