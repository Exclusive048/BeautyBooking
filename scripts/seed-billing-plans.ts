/**
 * Сид тарифов — шаг деплоя (BILLING-CATALOG-01, 2026-09-22).
 *
 * Запускается `deploy.yml` после миграций в КАЖДЫЙ деплой, worker-образом (тот
 * же приём, что `migrate`):
 *   $C --profile db run --rm --no-deps migrate npm run seed:plans
 *
 * Что делает, по порядку:
 *   1. Применяет канонический каталог тарифов (`src/lib/billing/plan-catalog.ts`):
 *      три тарифа × два кабинета + цены. Перезаписывает тарифы, только если
 *      версия каталога в коде новее применённой; иначе лишь досоздаёт
 *      отсутствующее — правки из /admin/billing переживают обычный деплой.
 *   2. Пока идёт стартовая акция (до 1 ноября, `launch-promo.ts`) — выдаёт
 *      PREMIUM до конца акции всем уже зарегистрированным мастерам и студиям.
 *      Идемпотентно: повторный прогон никого не трогает; платящих — никогда.
 *
 * Ненулевой код выхода — если не удалось применить каталог. Сбой выдачи
 * акции отдельным строкам печатается, но деплой не валит: тарифы уже на
 * месте, а строку добьёт следующий деплой.
 *
 * Локально:
 *   npm run seed:plans
 */
import { PrismaClient } from "@prisma/client";
import { applyPlanCatalog } from "../src/lib/billing/plan-seed";
import { backfillLaunchPromo } from "../src/lib/billing/launch-promo-grant";
import { LAUNCH_PROMO_ENDS_AT, isLaunchPromoActive } from "../src/lib/billing/launch-promo";

const prisma = new PrismaClient();

async function main() {
  console.log("Тарифы: применяю каталог…");
  const catalog = await applyPlanCatalog(prisma);
  console.log(
    `  режим: ${catalog.mode === "applied" ? "каталог применён" : "досоздание недостающего"} ` +
      `(версия ${catalog.appliedVersion}, была ${catalog.previousVersion ?? "—"})`,
  );
  if (catalog.createdPlans.length > 0) console.log(`  создано: ${catalog.createdPlans.join(", ")}`);
  if (catalog.deactivatedPlans.length > 0) {
    console.log(`  снято с витрины (вне каталога): ${catalog.deactivatedPlans.join(", ")}`);
  }

  const plans = await prisma.billingPlan.findMany({
    where: { isActive: true },
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }],
    select: {
      code: true,
      prices: { where: { isActive: true }, orderBy: { periodMonths: "asc" }, select: { periodMonths: true, priceKopeks: true } },
    },
  });
  for (const plan of plans) {
    const prices = plan.prices.map((p) => `${p.periodMonths} мес ${p.priceKopeks / 100} ₽`).join(" · ");
    console.log(`  ✓ ${plan.code}${prices ? ` — ${prices}` : " — бесплатно"}`);
  }

  if (!isLaunchPromoActive()) {
    console.log("\nАкция закончилась — выдача PREMIUM не выполняется.");
    return;
  }

  console.log(`\nАкция до ${LAUNCH_PROMO_ENDS_AT.toISOString()}: выдаю PREMIUM зарегистрированным кабинетам…`);
  const promo = await backfillLaunchPromo(prisma);
  console.log(
    `  выдано: ${promo.created + promo.upgraded} (новых строк ${promo.created}, переведено ${promo.upgraded}); ` +
      `уже на акции: ${promo["skipped-already"]}; платящих не тронуто: ${promo["skipped-paid"]}; ` +
      `нет PREMIUM-плана: ${promo["skipped-no-plan"]}; ошибок: ${promo.failed.length}`,
  );
  for (const failure of promo.failed) {
    console.error(`  ✗ ${failure.userId} / ${failure.scope}: ${failure.message}`);
  }
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
