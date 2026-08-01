import { createNotionCaptureAdapter, NotionCaptureError } from "../../../lib/notion-capture.mjs";
import { PUBLIC_SUPABASE_RUNTIME } from "../../../lib/pulse-public-runtime.mjs";

export const runtime = "edge";

function env(name: string) {
  return typeof process === "undefined" ? "" : String(process.env[name] || "").trim();
}

async function requireAuthenticatedOwner(request: Request) {
  const authorization = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new NotionCaptureError("AUTH_REQUIRED", "Sign in is required before writing to Notion", 401);
  }
  const projectUrl = (env("SUPABASE_URL") || PUBLIC_SUPABASE_RUNTIME.projectUrl).replace(/\/+$/, "");
  const publishableKey = env("SUPABASE_PUBLISHABLE_KEY") || PUBLIC_SUPABASE_RUNTIME.publishableKey;
  let response: Response;
  try {
    response = await fetch(`${projectUrl}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        authorization: authorization,
      },
    });
  } catch {
    throw new NotionCaptureError("AUTH_UNAVAILABLE", "The owner authentication service is unavailable", 503);
  }
  if (!response.ok) {
    throw new NotionCaptureError(
      response.status === 403 ? "AUTH_FORBIDDEN" : "AUTH_INVALID",
      response.status === 403 ? "This account is not allowed to use Pulse" : "The Pulse session is not valid",
      response.status === 403 ? 403 : 401,
    );
  }
  const user = await response.json().catch(() => null);
  if (!user?.id) throw new NotionCaptureError("AUTH_INVALID", "The Pulse session could not be confirmed", 401);
  return user;
}

export async function POST(request: Request) {
  try {
    await requireAuthenticatedOwner(request);
    const result = await createNotionCaptureAdapter(env("NOTION_TOKEN") || env("NOTION_API_KEY")).capture(await request.json());
    return Response.json({
      ok: true,
      ...result,
      status: "Verified",
      verified: true,
      message: result.state === "already_captured" ? "This operation was already verified in Notion." : "Capture written and verified in Notion.",
    }, { status: result.state === "captured" ? 201 : 200 });
  } catch (error) {
    const e = error instanceof NotionCaptureError ? error : new NotionCaptureError("INTERNAL_ERROR", "Capture failed", 500);
    return Response.json({
      ok: false,
      status: e.code === "NOTION_RATE_LIMITED" || e.code === "NOTION_UNAVAILABLE" ? "Needs Review" : "Failed",
      verified: false,
      message: e.message,
      error: { code: e.code, message: e.message },
    }, { status: e.status || 500 });
  }
}
