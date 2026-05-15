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
import { FEATURE_CATALOG, type FeatureKey, type LimitFeatureKey } from "@/lib/billing/feature-catalog";
import {
  isRelaxedLimit,
  parseOverrides,
  resolveEffectiveFeatures,
  type PlanFeatureOverrides,
  type PlanNode,
} from "@/lib/billing/features";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Edit a billing plan from the admin UI. Same scope as the legacy
 * `PATCH /api/admin/billing` (which accepts `id` in body); this
 * route uses the more conventional `[id]` segment AND writes a
 * `BillingAuditLog` row with a before/after diff.
 *
 * Editable fields:
 *   - `name`, `isActive`, `sortOrder` — admin chrome
 *   - `prices` — period -> kopeks
 *   - `features` — overrides Json blob (validated against the
 *     inheritance chain via `assertRelaxedLimits` so a child plan
 *     can never tighten a parent's numeric limit)
 *   - `inheritsFromPlanId` — parent plan id (or `null` to detach).
 *     Validated with `assertParentExists` + `assertNoInheritanceCycle`
 *     so we never create a cycle in the inheritance DAG.
 *
 * Not editable here:
 *   - `code`, `tier`, `scope` — invariant identifiers (changing
 *     these would break running subscriptions / cron lookups by code).
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
  features: z.record(z.string(), z.unknown()).optional(),
  inheritsFromPlanId: z.string().trim().min(1).nullable().optional(),
});

const LIMIT_FEATURE_KEYS = (Object.keys(FEATURE_CATALOG) as FeatureKey[]).filter(
  (key) => FEATURE_CATALOG[key].kind === "limit",
) as LimitFeatureKey[];

/** Throws 404 if `inheritsFromPlanId` is non-null and the parent
 * row doesn't exist. Skips when the value is null/undefined. */
async function assertParentExists(
  tx: Prisma.TransactionClient,
  inheritsFromPlanId: string | null | undefined,
): Promise<void> {
  if (!inheritsFromPlanId) return;
  const parent = await tx.billingPlan.findUnique({
    where: { id: inheritsFromPlanId },
    select: { id: true },
  });
  if (!parent) {
    throw new AppError("Родительский тариф не найден", 404, "PARENT_NOT_FOUND");
  }
}

/** Walks the inheritance chain from `inheritsFromPlanId` upward.
 * If we encounter `planId` (the plan being edited) we've created a
 * cycle. The walk is bounded by `MAX_DEPTH` as a final safety net
 * against pre-existing corrupted chains. */
async function assertNoInheritanceCycle(
  tx: Prisma.TransactionClient,
  planId: string,
  inheritsFromPlanId: string | null | undefined,
): Promise<void> {
  if (!inheritsFromPlanId) return;
  const MAX_DEPTH = 16;
  let current: string | null = inheritsFromPlanId;
  const visited = new Set<string>();
  for (let depth = 0; depth < MAX_DEPTH && current; depth += 1) {
    if (current === planId) {
      throw new AppError(
        "Обнаружен цикл наследования тарифов",
        400,
        "INHERITANCE_CYCLE",
      );
    }
    if (visited.has(current)) break; // corrupted chain — stop without false-positive
    visited.add(current);
    const parent: { inheritsFromPlanId: string | null } | null =
      await tx.billingPlan.findUnique({
        where: { id: current },
        select: { inheritsFromPlanId: true },
      });
    current = parent?.inheritsFromPlanId ?? null;
  }
}

/** For every numeric limit override in `next`, confirms that the
 * child's value is not stricter than the resolved `parentEffective`
 * limit. Booleans are skipped — `parseOverrides` already drops the
 * `false` values, and a `true` is always equal-or-richer than a
 * parent `true`. Throws `AppError(400, "STRICT_LIMIT")` with the
 * offending key in `fieldErrors`. */
function assertRelaxedLimits(
  next: PlanFeatureOverrides,
  parentEffective: Record<string, unknown>,
): void {
  for (const key of LIMIT_FEATURE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    const nextValue = (next as Record<string, unknown>)[key];
    const parentValue = parentEffective[key];
    if (
      !isRelaxedLimit(
        parentValue as number | null | undefined,
        (nextValue ?? null) as number | null,
      )
    ) {
      throw new AppError(
        "Лимит нельзя сделать строже, чем у родительского тарифа.",
        400,
        "STRICT_LIMIT",
        { fieldErrors: { [key]: "Limit cannot be stricter than parent." } },
      );
    }
  }
}

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
      (patch.prices && patch.prices.length > 0) ||
      patch.features !== undefined ||
      patch.inheritsFromPlanId !== undefined;
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
      // Inheritance + relaxed-limit validation when those fields are
      // part of the patch. The effective inheritance is whatever the
      // request asks for, falling back to the current value when the
      // patch leaves `inheritsFromPlanId` untouched.
      const beforePlan = await tx.billingPlan.findUnique({
        where: { id },
        select: { inheritsFromPlanId: true, features: true },
      });
      if (!beforePlan) {
        throw new AppError("Тариф не найден", 404, "NOT_FOUND");
      }
      const effectiveInherits =
        patch.inheritsFromPlanId !== undefined
          ? patch.inheritsFromPlanId
          : beforePlan.inheritsFromPlanId;

      if (patch.inheritsFromPlanId !== undefined) {
        await assertParentExists(tx, effectiveInherits);
        await assertNoInheritanceCycle(tx, id, effectiveInherits);
      }

      const nextOverrides =
        patch.features !== undefined
          ? parseOverrides(patch.features)
          : null;

      if (nextOverrides !== null && effectiveInherits) {
        // Build a plan map for parent resolution. Includes the plan
        // under edit as a draft so the parent's chain is correct when
        // the admin swaps both `inheritsFromPlanId` and `features` in
        // the same request.
        const allPlans = await tx.billingPlan.findMany({
          select: { id: true, inheritsFromPlanId: true, features: true },
        });
        const planNodes: Map<string, PlanNode> = new Map(
          allPlans.map((p) => [
            p.id,
            {
              id: p.id,
              inheritsFromPlanId: p.inheritsFromPlanId,
              features: p.features,
            },
          ]),
        );
        const parentEffective = resolveEffectiveFeatures(
          effectiveInherits,
          planNodes,
        ) as Record<string, unknown>;
        assertRelaxedLimits(nextOverrides, parentEffective);
      }

      const data: Prisma.BillingPlanUpdateInput = {};
      if (patch.name !== undefined) data.name = patch.name.trim();
      if (patch.isActive !== undefined) data.isActive = patch.isActive;
      if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
      if (patch.inheritsFromPlanId !== undefined) {
        data.inheritsFromPlan = patch.inheritsFromPlanId
          ? { connect: { id: patch.inheritsFromPlanId } }
          : { disconnect: true };
      }
      if (nextOverrides !== null) {
        data.features = nextOverrides as Prisma.InputJsonValue;
      }
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

      if (
        patch.inheritsFromPlanId !== undefined &&
        (patch.inheritsFromPlanId ?? null) !== (beforePlan.inheritsFromPlanId ?? null)
      ) {
        diff.inheritsFromPlanId = {
          before: beforePlan.inheritsFromPlanId ?? null,
          after: patch.inheritsFromPlanId ?? null,
        };
      }

      // Features diff: capture every catalog key whose value moved.
      // We compare the parsed overrides on both sides so transient
      // keys outside FEATURE_CATALOG can't sneak into the audit log.
      if (nextOverrides !== null) {
        const beforeOverrides = parseOverrides(beforePlan.features);
        const featureDiff: Record<string, { before: unknown; after: unknown }> = {};
        for (const key of Object.keys(FEATURE_CATALOG) as FeatureKey[]) {
          const beforeVal = (beforeOverrides as Record<string, unknown>)[key];
          const afterVal = (nextOverrides as Record<string, unknown>)[key];
          // Strict equality is enough — overrides are primitives
          // (boolean true / number / null / undefined).
          if (beforeVal !== afterVal) {
            featureDiff[key] = { before: beforeVal, after: afterVal };
          }
        }
        if (Object.keys(featureDiff).length > 0) {
          diff.features = { before: featureDiff, after: undefined };
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

    // Render a human-friendly features summary for subscribers. We
    // re-derive the diff against the *active* feature catalog so an
    // override on a `status: planned` key (which the UI shouldn't show
    // anyway) doesn't generate noise like "добавлено: <planned key>".
    if (patch.features !== undefined && updated) {
      const beforeOverrides = parseOverrides(before.features);
      const afterOverrides = parseOverrides(updated.features);
      const added: string[] = [];
      const removed: string[] = [];
      const limitChanges: string[] = [];
      for (const key of Object.keys(FEATURE_CATALOG) as FeatureKey[]) {
        const def = FEATURE_CATALOG[key];
        if (def.status !== "active") continue;
        const beforeVal = (beforeOverrides as Record<string, unknown>)[key];
        const afterVal = (afterOverrides as Record<string, unknown>)[key];
        if (beforeVal === afterVal) continue;
        if (def.kind === "boolean") {
          if (afterVal === true) added.push(def.title);
          else removed.push(def.title);
        } else if (def.kind === "limit") {
          // For limits we only summarise direction, not raw numbers —
          // detailed limit values live in the audit log, not the
          // subscriber notification.
          limitChanges.push(def.title);
        }
      }
      const fragments: string[] = [];
      if (added.length > 0) fragments.push(`добавлено: ${added.join(", ")}`);
      if (removed.length > 0) fragments.push(`убрано: ${removed.join(", ")}`);
      if (limitChanges.length > 0) {
        fragments.push(`изменены лимиты: ${limitChanges.join(", ")}`);
      }
      if (fragments.length > 0) {
        subscriberDiff.featuresSummary = fragments.join("; ");
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
