type D1Database = import("@cloudflare/workers-types").D1Database;
type Fetcher = import("@cloudflare/workers-types").Fetcher;

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    [binding: string]: unknown;
  };
}
