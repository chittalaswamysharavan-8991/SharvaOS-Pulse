import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dailyLogs = sqliteTable(
  "daily_logs",
  {
    id: text("id").primaryKey(),
    userKey: text("user_key").notNull(),
    logDate: text("log_date").notNull(),
    kind: text("kind", { enum: ["water", "smoke", "food"] }).notNull(),
    label: text("label").notNull(),
    detail: text("detail").notNull().default(""),
    amount: integer("amount"),
    loggedAt: integer("logged_at").notNull(),
    source: text("source").notNull().default("web"),
  },
  (table) => [
    index("daily_logs_user_date_idx").on(table.userKey, table.logDate),
    index("daily_logs_user_kind_idx").on(table.userKey, table.kind),
  ],
);

export const dailyTodos = sqliteTable(
  "daily_todos",
  {
    id: text("id").primaryKey(),
    userKey: text("user_key").notNull(),
    taskDate: text("task_date").notNull(),
    text: text("text").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("daily_todos_user_date_idx").on(table.userKey, table.taskDate),
  ],
);
