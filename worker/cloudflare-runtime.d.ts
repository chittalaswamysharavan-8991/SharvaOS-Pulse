type D1Database = import("@cloudflare/workers-types").D1Database;

interface Fetcher {
  fetch(request: Request): Response | Promise<Response>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    [binding: string]: unknown;
  };
}
