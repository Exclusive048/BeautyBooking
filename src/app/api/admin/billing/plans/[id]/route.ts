import { z } from "zod";
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { BILLING_PERIODS } from "@/lib/billing/constants";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { logError, logInfo } from "@/lib/logging/logger";
import * as cache from "@/lib/cache/cache";
import { snapshotPlanForAudit } from "@/features/admin-cabinet/billing/server/plans.service";
import {
  buildPlanEditedSummary,
  type PlanEditDiff,
} from "@/lib/notifications/admin-body-templates";
import { enqueuePlanEditedMassNotification } from "@/lib/notifications/admin-initiated";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Edit a billing plan from the admin UI. Same scope as the legacy
 * `PATCH /api/admin/billing` (which accepts `id` in body); this
 * route uses the more conventional `[id]` segment AND writes a
 * `BillingAuditLog` row with a before/after diff.
 *
 * Editable fields are intentionally narrow:
 *   - `name`, `isActive`, `sortOrder` — admin chrome
 *   - `prices` — period -> kopeks
 *
 * Not editable here:
 *   - `code`, `tier`, `scope` — invariant identifiers
 *   - `features` — has nontrivial inheritance/relaxed-limit logic;
 *     stays on the legacy endpoint for now. ADMIN-BILLING-B may
 *     bring a dedicated features editor.
 */
const bodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  prices: z
    .array(
      z.object({
        periodMonths: z.number().int().refine((value) =>
          BILLING_PERIODS.includes(value as (typeof BILLING_PERIODS)[number]),
        ),
        priceKopeks: z.number().int().min(0),
      }),
    )
    .optional(),
});

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Не указан id плана", 400, "VALIDATION_ERROR");

    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }
    const patch = parsed.data;
    const hasAny =
      patch.name !== undefined ||
      patch.isActive !== undefined ||
      patch.sortOrder !== undefined ||
      (patch.prices && patch.prices.length > 0);
    if (!hasAny) {
      return fail("Нет полей для обновления", 400, "VALIDATION_ERROR");
    }

    // Snapshot the plan BEFORE applying the patch — captured so the
    // audit-log entry contains a faithful diff even if the row is
    // changed concurrently by another admin.
    const { prisma } = await import("@/lib/prisma");
    const before = await snapshotPlanForAudit(id);
    if (!before) {
      return fail("Тариф не найден", 404, "NOT_FOUND");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: Prisma.BillingPlanUpdateInput = {};
      if (patch.name !== undefined) data.name = patch.name.trim();
      if (patch.isActive !== undefined) data.isActive = patch.isActive;
      if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
      await tx.billingPlan.update({ where: { id }, data });

      if (patch.prices && patch.prices.length > 0) {
        for (const entry of patch.prices) {
          await tx.billingPlanPrice.upsert({
            where: {
              planId_periodMonths: {
                planId: id,
                periodMonths: entry.periodMonths,
              },
            },
            create: {
              planId: id,
              periodMonths: entry.periodMonths,
              priceKopeks: entry.priceKopeks,
              isActive: true,
            },
            update: {
              priceKopeks: entry.priceKopeks,
            },
          });
        }
      }

      const fresh = await tx.billingPlan.findUnique({
        where: { id },
        select: {
          id: true,
          code: true,
          name: true,
          tier: true,
          scope: true,
          isActive: true,
          sortOrder: true,
          features: true,
          updatedAt: true,
          prices: {
            select: { periodMonths: true, priceKopeks: true, isActive: true },
            orderBy: { periodMonths: "asc" },
          },
        },
      });

      // Capture the audited diff. We only record fields that actually
      // changed — keeps the BillingAuditLog row small and the audit
      // trail readable.
      const diff: Record<string, { before: unknown; after: unknown }> = {};
      if (patch.name !== undefined && patch.name.trim() !== before.name) {
        diff.name = { before: before.name, after: patch.name.trim() };
      }
      if (
        patch.isActive !== undefined &&
        patch.isActive !== before.isActive
      ) {
        diff.isActive = { before: before.isActive, after: patch.isActive };
      }
      if (
        patch.sortOrder !== undefined &&
        patch.sortOrder !== before.sortOrder
      ) {
        diff.sortOrder = {
          before: before.sortOrder,
          after: patch.sortOrder,
        };
      }
      if (patch.prices && patch.prices.length > 0) {
        const beforeMap = new Map(
          before.prices.map((p) => [p.periodMonths, p.priceKopeks]),
        );
        const priceDiff: Record<string, { before: number; after: number }> = {};
        for (const entry of patch.prices) {
          const prev = beforeMap.get(entry.periodMonths) ?? 0;
          if (prev !== entry.priceKopeks) {
            priceDiff[`${entry.periodMonths}m`] = {
              before: prev,
              after: entry.priceKopeks,
            };
          }
        }
        if (Object.keys(priceDiff).length > 0) {
          diff.prices = { before: priceDiff, after: undefined };
        }
      }

      if (Object.keys(diff).length > 0) {
        await createBillingAuditLog(
          {
            userId: auth.user.id,
            scope: null,
            action: "ADMIN_PLAN_EDITED",
            details: {
              adminUserId: auth.user.id,
              planId: id,
              planCode: fresh?.code ?? null,
              diff,
            } as Prisma.InputJsonValue,
          },
          tx,
        );

        // Parallel write to the unified admin audit trail. Failure
        // here rolls the surrounding business mutation back — that is
        // the desired behaviour while we still operate dual-write.
        await createAdminAuditLog({
          tx,
          adminUserId: auth.user.id,
          action: "BILLING_PLAN_EDITED",
          targetType: "billing_plan",
          targetId: id,
          details: {
            planCode: fresh?.code ?? null,
            changes: diff,
          } as Prisma.InputJsonValue,
          context: getAdminAuditContext(req),
        });
      }

      return fresh;
    });

    // Plan cache TTL is 5 min — pattern-delete clears all subscriber
    // entries so the freshly-edited plan takes effect immediately.
    try {
      await cache.delByPattern("plan:current:*");
    } catch (err) {
      logError("admin.billing.plan.cache_invalidation_failed", {
        planId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    logInfo("admin.billing.plan.edited", {
      adminUserId: auth.user.id,
      planId: id,
      planCode: updated?.code ?? null,
    });

    // Mass dispatch: enqueue a fan-out notification job for active
    // subscribers of this plan. Built after the transaction commits so
    // we never enqueue work that the DB then rolled back. Sparse edits
    // (sortOrder churn only, or no-ops) produce a `null` summary and
    // skip enqueue.
    const subscriberDiff: PlanEditDiff = {};
    if (
      before.name !== (updated?.name ?? before.name) &&
      typeof updated?.name === "string"
    ) {
      subscriberDiff.name = { before: before.name, after: updated.name };
    }
    if (
      updated &&
      before.isActive !== updated.isActive
    ) {
      subscriberDiff.isActive = {
        before: before.isActive,
        after: updated.isActive,
      };
    }
    if (updated) {
      const beforePriceMap = new Map(
        before.prices.map((p) => [p.periodMonths, p.priceKopeks]),
      );
      const subscriberPrices: Record<string, { before: number; after: number }> = {};
      for (const p of updated.prices) {
        const prev = beforePriceMap.get(p.periodMonths);
        if (typeof prev === "number" && prev !== p.priceKopeks) {
          subscriberPrices[`${p.periodMonths}m`] = {
            before: prev,
            after: p.priceKopeks,
          };
        }
      }
      if (Object.keys(subscriberPrices).length > 0) {
        subscriberDiff.prices = subscriberPrices;
      }
    }

    const summary = buildPlanEditedSummary(subscriberDiff);
    if (summary && updated) {
      try {
        await enqueuePlanEditedMassNotification({
          planId: updated.id,
          planCode: updated.code,
          summary,
        });
      } catch (err) {
        logError("admin.billing.plan.mass_notify.enqueue_failed", {
          planId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return ok({ plan: updated });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
