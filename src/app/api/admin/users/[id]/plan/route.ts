import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { logError } from "@/lib/logging/logger";
import {
  AdminPlanChangeError,
  adminChangeUserPlan,
} from "@/features/admin-cabinet/users/server/plan-change.service";

export const runtime = "nodejs";

/**
 * Admin-bypass plan change. The legacy PATCH `/api/admin/users` route
 * accepts `{userId, planId}` and is still used by the deprecated
 * AdminUsers UI; this newer route uses the more honest contract from
 * ADMIN-USERS-A: `{planCode, periodMonths, reason}` and writes a
 * BillingAuditLog entry.
 */

const bodySchema = z.object({
  planCode: z.string().trim().min(1),
  periodMonths: z.union([
    z.literal(1),
    z.literal(3),
    z.literal(6),
    z.literal(12),
  ]),
  reason: z.string().trim().max(500).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Не указан id пользователя", 400, "VALIDATION_ERROR");

    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return fail("Некорректные данные", 400, "VALIDATION_ERROR");
    }

    const subscription = await adminChangeUserPlan({
      adminUserId: auth.user.id,
      targetUserId: id,
      planCode: parsed.data.planCode,
      periodMonths: parsed.data.periodMonths,
      reason: parsed.data.reason ?? null,
      context: getAdminAuditContext(req),
    });

    return ok({ subscription });
  } catch (error) {
    if (error instanceof AdminPlanChangeError) {
      const status = error.code === "PLAN_NOT_FOUND" ? 404 : error.code === "USER_NOT_FOUND" ? 404 : 400;
      return fail(error.message, status, error.code);
    }
    logError("admin.users.plan.change failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail("Не удалось изменить тариф", 500, "ADMIN_PLAN_CHANGE_FAILED");
  }
}
