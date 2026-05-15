import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { logError } from "@/lib/logging/logger";
import {
  AdminCancelSubscriptionError,
  adminCancelSubscription,
} from "@/features/admin-cabinet/billing/server/cancel-subscription.service";

export const runtime = "nodejs";

/**
 * Admin cancel of someone else's subscription. The user-facing
 * `/api/billing/cancel` endpoint operates on the **session user's**
 * subscription; this admin counterpart accepts a target subscription
 * id and writes an `ADMIN_SUBSCRIPTION_CANCELLED` audit row.
 *
 * Semantics: `cancelAtPeriodEnd: true` + `autoRenew: false` —
 * subscription stays ACTIVE/PAST_DUE until the period boundary, then
 * the renewal cron flips it to CANCELLED. User retains paid access
 * meanwhile.
 */
const bodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Не указан id подписки", 400, "VALIDATION_ERROR");

    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return fail("Некорректные данные", 400, "VALIDATION_ERROR");
    }

    const result = await adminCancelSubscription({
      adminUserId: auth.user.id,
      subscriptionId: id,
      reason: parsed.data.reason ?? null,
      context: getAdminAuditContext(req),
    });

    return ok({ subscription: result });
  } catch (error) {
    if (error instanceof AdminCancelSubscriptionError) {
      const status = error.code === "SUBSCRIPTION_NOT_FOUND" ? 404 : 409;
      return fail(error.message, status, error.code);
    }
    logError("admin.billing.subscription.cancel failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(
      "Не удалось отменить подписку",
      500,
      "ADMIN_CANCEL_SUBSCRIPTION_FAILED",
    );
  }
}
