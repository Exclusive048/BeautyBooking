import { fail, ok } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { logError } from "@/lib/logging/logger";
import { getAdminBillingKpis } from "@/features/admin-cabinet/billing/server/kpis.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MRR / active-subs / pending / failed-7d for the admin billing
 * dashboard. Currently called via SSR fetch on `/admin/billing`; the
 * separate endpoint exists so subsequent commits (ADMIN-BILLING-B
 * adds Subscriptions / Payments tabs) can re-use it for polling.
 */
export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const data = await getAdminBillingKpis();
    return ok(data);
  } catch (error) {
    logError("admin.billing.kpis failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail("Не удалось загрузить метрики", 500, "ADMIN_BILLING_KPIS_FAILED");
  }
}
