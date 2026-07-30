import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPendingOperations,
  isValidWaterAmount,
  normalizeImportedLog,
  parsePendingOperations,
} from "../lib/pulse-reliability.mjs";

test("water validation accepts only whole amounts from 50 through 2000 ml", () => {
  assert.equal(isValidWaterAmount(50), true);
  assert.equal(isValidWaterAmount(2000), true);
  assert.equal(isValidWaterAmount(49), false);
  assert.equal(isValidWaterAmount(2001), false);
  assert.equal(isValidWaterAmount(250.5), false);
  assert.equal(isValidWaterAmount(-250), false);
});

test("device import preserves the original loggedAt timestamp", () => {
  const loggedAt = 1_722_345_678_901;
  const entry = normalizeImportedLog({
    id: "log-1",
    kind: "water",
    label: "250 ml water",
    detail: "Hydration",
    amount: 250,
    loggedAt,
  });
  assert.equal(entry?.loggedAt, loggedAt);
  assert.equal(normalizeImportedLog({
    id: "log-legacy",
    kind: "water",
    label: "250 ml water",
    detail: "Hydration",
    amount: 250,
    timestamp: loggedAt,
  }), null);
});

test("pending offline operations are applied over remote state without being overwritten", () => {
  const remote = {
    logs: [{ id: "remote", kind: "food", label: "Breakfast", detail: "Breakfast", amount: null, loggedAt: 100 }],
    todos: [{ id: "task-1", text: "Existing task", done: false, createdAt: 10 }],
  };
  const pending = [
    {
      queueId: "queue-1",
      createdAt: 200,
      body: {
        action: "add_log",
        id: "offline-water",
        kind: "water",
        label: "500 ml water",
        detail: "Hydration",
        amount: 500,
        loggedAt: 200,
      },
    },
    {
      queueId: "queue-2",
      createdAt: 201,
      body: { action: "toggle_todo", id: "task-1", done: true },
    },
  ];
  const reconciled = applyPendingOperations(remote, pending);
  assert.deepEqual(reconciled.logs.map((item) => item.id), ["offline-water", "remote"]);
  assert.equal(reconciled.todos[0].done, true);
});

test("pending deletions remain applied until the server confirms them", () => {
  const remote = {
    logs: [{ id: "delete-me", kind: "smoke", label: "Smoke", detail: "Entry", amount: null, loggedAt: 100 }],
    todos: [{ id: "task-delete", text: "Remove", done: false, createdAt: 10 }],
  };
  const reconciled = applyPendingOperations(remote, [
    { queueId: "q1", body: { action: "delete_log", id: "delete-me" }, createdAt: 1 },
    { queueId: "q2", body: { action: "delete_todo", id: "task-delete" }, createdAt: 2 },
  ]);
  assert.deepEqual(reconciled, { logs: [], todos: [] });
});

test("corrupt pending storage cannot block startup", () => {
  assert.deepEqual(parsePendingOperations("not-json"), []);
  assert.deepEqual(parsePendingOperations(JSON.stringify([{ bad: true }])), []);
});
