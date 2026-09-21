import type { Prisma, PrismaClient } from "@prisma/client";
import {
  PLAN_CATALOG,
  PLAN_CATALOG_VERSION,
  PLAN_CATALOG_VERSION_KEY,
  type CatalogPlan,
} from "@/lib/billing/plan-catalog";

/**
 * Рождение тарифов из канонического каталога (`plan-catalog.ts`).
 *
 * PWA-FIX-01 — клиент приходит АРГУМЕНТОМ, а не берётся из `@/lib/prisma`.
 *
 * 🔴 Прежняя форма делала сидер незапускаемым, причём молча по симптому:
 * `src/lib/prisma.ts` первой строкой импортирует `server-only`, а тот вне
 * рантайма Next (условие экспорта `react-server` не выставлено) бросает
 * «This module cannot be imported from a Client Component module». То есть
 * `npm run seed:plans` падал ЕЩЁ ДО первой строки `main()` — на импорте, — и
 * сообщение говорило про клиентские компоненты, к которым сид отношения не
 * имеет. Цена в проде прямая: без строк `MASTER_FREE`/`STUDIO_FREE` не
 * выдаётся бесплатная подписка (`ensureFreeSubscription`) и пуста страница
 * «Тарифы» (`/api/billing/plans` на masterryadom.ru отдавал пустые списки
 * 2026-09-01).
 *
 * Параметр — не «гибкость на будущее», а способ НЕ тащить рантайм-клиент в
 * процесс, которому он не нужен: у сида свой `new PrismaClient()`. Рантайм
 * этих функций не зовёт вовсе — единственные потребители суть скрипты.
 */

type SeedClient = Pick<PrismaClient, "billingPlan" | "billingPlanPrice" | "systemConfig" | "$transaction">;
type SeedTx = Prisma.TransactionClient;

function planCreateData(plan: CatalogPlan) {
  return {
    code: plan.code,
    name: plan.name,
    tier: plan.tier,
    scope: plan.scope,
    features: plan.features as Prisma.InputJsonValue,
    sortOrder: plan.sortOrder,
    isActive: true,
  };
}

/**
 * Досоздаёт только FREE-планы, ничего не перезаписывая. Нужен справочному сиду
 * (`seed:reference`) и старому `migrate-billing-plans` — им полный каталог не
 * нужен, а бесплатная подписка без FREE-плана не выдаётся.
 */
export async function ensureFreePlans(client: Pick<PrismaClient, "billingPlan">): Promise<void> {
  for (const plan of PLAN_CATALOG.filter((p) => p.tier === "FREE")) {
    await client.billingPlan.upsert({
      where: { code: plan.code },
      create: planCreateData(plan),
      // Do NOT overwrite existing records — admins may have modified them.
      update: {},
    });
  }
}

// Keep backward-compatible export for existing migration scripts.
export const ensureDefaultPlans = ensureFreePlans;

export type PlanCatalogApplyResult = {
  mode: "applied" | "ensured";
  appliedVersion: number;
  previousVersion: number | null;
  createdPlans: string[];
  /** Активные планы вне каталога на тех же (scope, tier), снятые с витрины. */
  deactivatedPlans: string[];
};

function readVersion(value: unknown): number | null {
  if (typeof value === "object" && value !== null && "version" in value) {
    const v = (value as { version: unknown }).version;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return null;
}

async function writePrices(tx: SeedTx, planId: string, plan: CatalogPlan): Promise<void> {
  const periods = plan.pricesKopeks.map((p) => p.periodMonths);
  for (const price of plan.pricesKopeks) {
    await tx.billingPlanPrice.upsert({
      where: { planId_periodMonths: { planId, periodMonths: price.periodMonths } },
      create: { planId, periodMonths: price.periodMonths, priceKopeks: price.priceKopeks, isActive: true },
      update: { priceKopeks: price.priceKopeks, isActive: true },
    });
  }
  // Сроки вне каталога не продаются. Строку не удаляем — на неё могут
  // ссылаться история и аудит, выключения достаточно (checkout/витрина читают
  // только активные цены).
  await tx.billingPlanPrice.updateMany({
    where: { planId, periodMonths: { notIn: periods.length > 0 ? periods : [-1] }, isActive: true },
    data: { isActive: false },
  });
}

/**
 * Применяет каталог тарифов. Идемпотентно, рассчитано на запуск в КАЖДЫЙ деплой.
 *
 *  - версия каталога в коде новее применённой (или метки нет) → тарифы и цены
 *    приводятся к каталогу целиком, лишние активные планы на тех же
 *    (scope, tier) снимаются с витрины, метка версии обновляется;
 *  - иначе → только досоздаются отсутствующие планы (со своими ценами), а
 *    существующие не трогаются: правка из /admin/billing переживает деплой.
 *
 * Снятие «лишних» планов безопасно для подписчиков: подписка резолвит свой
 * план по id и `isActive` не смотрит; снятый план лишь перестаёт продаваться
 * и не может быть выбран trial-выдачей как «PREMIUM этого кабинета».
 */
export async function applyPlanCatalog(client: SeedClient): Promise<PlanCatalogApplyResult> {
  return client.$transaction(async (tx) => {
    const marker = await tx.systemConfig.findUnique({
      where: { key: PLAN_CATALOG_VERSION_KEY },
      select: { value: true },
    });
    const previousVersion = readVersion(marker?.value);
    const shouldApply = previousVersion === null || previousVersion < PLAN_CATALOG_VERSION;

    const createdPlans: string[] = [];
    const deactivatedPlans: string[] = [];

    for (const plan of PLAN_CATALOG) {
      const existing = await tx.billingPlan.findUnique({
        where: { code: plan.code },
        select: { id: true },
      });

      if (!existing) {
        const created = await tx.billingPlan.create({ data: planCreateData(plan), select: { id: true } });
        await writePrices(tx, created.id, plan);
        createdPlans.push(plan.code);
        continue;
      }

      if (!shouldApply) continue;

      await tx.billingPlan.update({
        where: { id: existing.id },
        data: {
          name: plan.name,
          tier: plan.tier,
          scope: plan.scope,
          features: plan.features as Prisma.InputJsonValue,
          sortOrder: plan.sortOrder,
          isActive: true,
          inheritsFromPlanId: null,
        },
      });
      await writePrices(tx, existing.id, plan);
    }

    if (shouldApply) {
      const catalogCodes = PLAN_CATALOG.map((p) => p.code);
      const strays = await tx.billingPlan.findMany({
        where: { isActive: true, code: { notIn: catalogCodes } },
        select: { id: true, code: true },
      });
      if (strays.length > 0) {
        await tx.billingPlan.updateMany({
          where: { id: { in: strays.map((s) => s.id) } },
          data: { isActive: false },
        });
        deactivatedPlans.push(...strays.map((s) => s.code));
      }

      const value = { version: PLAN_CATALOG_VERSION, appliedAt: new Date().toISOString() };
      await tx.systemConfig.upsert({
        where: { key: PLAN_CATALOG_VERSION_KEY },
        create: { key: PLAN_CATALOG_VERSION_KEY, value },
        update: { value },
      });
    }

    return {
      mode: shouldApply ? ("applied" as const) : ("ensured" as const),
      appliedVersion: shouldApply ? PLAN_CATALOG_VERSION : (previousVersion ?? PLAN_CATALOG_VERSION),
      previousVersion,
      createdPlans,
      deactivatedPlans,
    };
  });
}
