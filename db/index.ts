import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

async function getBinding() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Apply the checked-in migration before serving requests, then configure the `DB` binding in .openai/hosting.json.",
    );
  }
  return env.DB;
}

export async function getDb() {
  return drizzle(await getBinding(), { schema });
}
