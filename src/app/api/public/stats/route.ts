import { ok } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { logError } from "@/lib/logging/logger";
import { getPublicStats } from "@/lib/stats/public-stats";

export const runtime = "nodejs";

export async function GET() {
  try {
    const stats = await getPublicStats();
    return ok(stats);
  } catch (error) {
    const appError = toAppError(error);
    logError("GET /api/public/stats failed", {
      route: "GET /api/public/stats",
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ ok: false, error: { message: appError.message } }), {
      status: appError.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
