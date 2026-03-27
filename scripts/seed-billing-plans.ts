/**
 * Billing plans seed script.
 * Safe to run multiple times — uses upsert.
 * Usage: npx tsx scripts/seed-billing-plans.ts
 */
import { ensureDefaultPlans } from "../src/lib/billing/plan-seed";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding billing plans...");
  await ensureDefaultPlans();

  const plans = await prisma.billingPlan.findMany({
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }],
    select: { code: true, name: true, tier: true, scope: true, prices: { select: { periodMonths: true, priceKopeks: true } } },
  });

  for (const plan of plans) {
    const monthly = plan.prices.find((p) => p.periodMonths === 1);
    console.log(`  ${plan.code} (${plan.tier}/${plan.scope}) — ${monthly ? monthly.priceKopeks / 100 : 0} RUB/month`);
  }

  console.log(`Done. ${plans.length} plans seeded.`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
