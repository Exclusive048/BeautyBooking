import type { BillingPlan } from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { applyPlanCatalog } from "../../../src/lib/billing/plan-seed";
import { PLAN_CATALOG } from "../../../src/lib/billing/plan-catalog";

// BILLING-CATALOG-01: тарифы тестового сида рождаются из того же канонического
// каталога, что и в проде (`src/lib/billing/plan-catalog.ts`, шаг деплоя
// `npm run seed:plans`) — фичи, лимиты и цены. Раньше здесь жила собственная
// копия фич без единой цены, и dev-стенд показывал «Цена уточняется» там, где
// прод покажет рубли. Семантика перезаписи — общая: `applyPlanCatalog`
// приводит тарифы к каталогу только при новой версии каталога, иначе лишь
// досоздаёт недостающее (правки админа переживают повторный сид).

export async function seedBillingPlans(): Promise<BillingPlan[]> {
  logSeed.section("Billing plans");
  const result = await applyPlanCatalog(prisma);
  const rows = await prisma.billingPlan.findMany({
    where: { code: { in: PLAN_CATALOG.map((p) => p.code) } },
  });
  logSeed.ok(`${rows.length} billing plans ensured (catalog v${result.appliedVersion}, ${result.mode})`);
  return rows;
}
