import { requireAdminAuth } from "@/lib/auth/admin";
import { fail, ok } from "@/lib/api/response";
import { logError } from "@/lib/logging/logger";
import { UI_TEXT } from "@/lib/ui/text";
import { getAdminHealth } from "@/features/admin-cabinet/dashboard/server/health.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const data = await getAdminHealth();
    return ok(data);
  } catch (error) {
    logError("admin.dashboard.health failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(
      UI_TEXT.adminPanel.dashboard.errors.loadHealth,
      500,
      "ADMIN_HEALTH_FAILED",
    );
  }
}
