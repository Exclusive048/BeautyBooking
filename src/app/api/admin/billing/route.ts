import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";

/**
 * SECURITY-EXPOSURE-AUDIT-01 · Y14 (FIX-LEGACY-BILLING-ROUTE-01) — the legacy
 * `POST` (create plan) and `PATCH` (edit plan, including `code`/`tier`/`scope`)
 * handlers are **retired → 410 Gone**. They had zero callers and were the only
 * path that could edit `code`/`tier`/`scope` — which the sanctioned
 * `PATCH /api/admin/billing/plans/[id]` deliberately forbids (changing them
 * breaks running subscriptions and cron lookups by code), with no audit log and
 * none of that route's validation.
 *
 * Replacement paths:
 *   - Runtime plan administration (name / prices / isActive / features / sort):
 *     `PATCH /api/admin/billing/plans/[id]` (audited, last-active-guarded).
 *   - Plan STRUCTURE (`code`/`tier`/`scope`) and plan CREATION: the **seed**
 *     (`scripts/seed-billing-plans.ts`) at deploy time — versioned & reviewable.
 *
 * `GET` (list plans) is left untouched. Auth still runs first so the 410 is
 * never the one unauthenticated response on an admin path.
 */

const RETIRED_MESSAGE =
  "Этот эндпоинт выведен из эксплуатации. Управляйте планами через /api/admin/billing/plans/[id]; структуру плана (code/tier/scope) и создание — через seed.";

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const plans = await prisma.billingPlan.findMany({
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      tier: true,
      scope: true,
      features: true,
      sortOrder: true,
      inheritsFromPlanId: true,
      isActive: true,
      updatedAt: true,
      prices: {
        select: { id: true, periodMonths: true, priceKopeks: true, isActive: true },
        orderBy: { periodMonths: "asc" },
      },
    },
  });

  return ok({ plans });
}

export async function POST() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;
  return fail(RETIRED_MESSAGE, 410, "ENDPOINT_RETIRED");
}

export async function PATCH() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;
  return fail(RETIRED_MESSAGE, 410, "ENDPOINT_RETIRED");
}
