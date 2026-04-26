/**
 * Billing plans seed script — creates MASTER_FREE and STUDIO_FREE only.
 * Safe to run multiple times (upsert with empty update — never overwrites existing).
 *
 * PRO and PREMIUM plans must be created by admins through /admin/billing.
 *
 * Usage:
 *   npm run seed:plans
 *   npx tsx scripts/seed-billing-plans.ts
 */
import { ensureFreePlans } from "../src/lib/billing/plan-seed";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding FREE billing plans...");
  await ensureFreePlans();

  const plans = await prisma.billingPlan.findMany({
    where: { tier: "FREE" },
    orderBy: [{ scope: "asc" }],
    select: { code: true, name: true, tier: true, scope: true, isActive: true },
  });

  for (const plan of plans) {
    console.log(`  ✓ ${plan.code} (${plan.tier}/${plan.scope}) active=${plan.isActive}`);
  }

  console.log(`\nDone. ${plans.length} FREE plan(s) ensured.`);
  console.log("Create PRO/PREMIUM plans through /admin/billing\n");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
