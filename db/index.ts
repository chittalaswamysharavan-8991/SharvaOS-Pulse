import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

async function getBinding() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }
  return env.DB;
}

export async function getDb() {
  return drizzle(await getBinding(), { schema });
}

export async function ensureSchema() {
  const binding = await getBinding();
  await binding.exec(`
    CREATE TABLE IF NOT EXISTS daily_logs (
      id text PRIMARY KEY NOT NULL,
      user_key text NOT NULL,
      log_date text NOT NULL,
      kind text NOT NULL,
      label text NOT NULL,
      detail text DEFAULT '' NOT NULL,
      amount integer,
      logged_at integer NOT NULL,
      source text DEFAULT 'web' NOT NULL
    );
    CREATE INDEX IF NOT EXISTS daily_logs_user_date_idx ON daily_logs (user_key, log_date);
    CREATE INDEX IF NOT EXISTS daily_logs_user_kind_idx ON daily_logs (user_key, kind);
    CREATE TABLE IF NOT EXISTS daily_todos (
      id text PRIMARY KEY NOT NULL,
      user_key text NOT NULL,
      task_date text NOT NULL,
      text text NOT NULL,
      done integer DEFAULT false NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
    CREATE INDEX IF NOT EXISTS daily_todos_user_date_idx ON daily_todos (user_key, task_date);
  `);
}
