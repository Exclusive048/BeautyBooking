/**
 * Cleanup duplicate billing plans (lowercase dead leftovers).
 *
 * Background — see ADMIN-BILLING-FIX-AUDIT report:
 *   Three competing seed sources have, at various points in this project's
 *   history, written BillingPlan rows with case-mismatched `code` values.
 *   `BillingPlan.code` is `@unique` but PostgreSQL string comparison is
 *   case-sensitive, so `master_free` and `MASTER_FREE` coexist as
 *   different rows. The UPPERCASE set is canonical — production runtime
 *   (`ensure-free-subscription.ts`, `get-current-plan.ts`, billing tests)
 *   looks them up by exact code. The lowercase snake_case set
 *   (`master_free` … `studio_premium`, from `prisma/seed-test.sql`) is
 *   dead — no runtime consumer.
 *
 * This script migrates any UserSubscription pointing at the lowercase
 * variant to the matching UPPERCASE plan, re-points inheritance edges
 * (`BillingPlan.inheritsFromPlanId`) and then deletes the lowercase
 * rows. `BillingPlanPrice` is `onDelete: Cascade`, so prices follow
 * automatically.
 *
 * Idempotent: a re-run after a successful cleanup finds no lowercase
 * plans and exits with a no-op message.
 *
 * USAGE:
 *   npx tsx scripts/cleanup-duplicate-billing-plans.ts            # DRY RUN (default)
 *   npx tsx scripts/cleanup-duplicate-billing-plans.ts --confirm  # actually apply
 *
 * NOTES:
 *   - `UserSubscription.planId` has `onDelete: Cascade`. Deleting a
 *     lowercase plan WITHOUT first migrating its subscriptions would
 *     drop those subscriptions silently. The script therefore migrates
 *     before delete, in a single transaction per lowercase plan.
 *   - Per-plan transaction isolates failures: if one lowercase plan
 *     hits a hiccup, the other five still complete.
 *   - Short-code leftovers from `prisma/seed.sql` (`free`, `pro`,
 *     `premium`, `studio_pro`) are reported as a separate finding —
 *     not auto-deleted. They have a clean mapping in
 *     `scripts/migrate-billing-plans.ts` which renames them in place;
 *     mixing rename+delete in the same script would conflict if
 *     UPPERCASE versions also exist. Run that script first if needed.
 */
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const LOWERCASE_TO_UPPERCASE: Readonly<Record<string, string>> = {
  master_free: "MASTER_FREE",
  master_pro: "MASTER_PRO",
  master_premium: "MASTER_PREMIUM",
  studio_free: "STUDIO_FREE",
  studio_pro: "STUDIO_PRO",
  studio_premium: "STUDIO_PREMIUM",
};

/** Short codes from the much older `prisma/seed.sql`. Reported only —
 * not auto-migrated by this script (use `migrate-billing-plans.ts`). */
const SHORT_CODES: ReadonlyArray<string> = ["free", "pro", "premium", "studio_pro"];

type PlanRow = {
  id: string;
  code: string;
  tier: string;
  scope: string;
  isActive: boolean;
};

type CleanupAction =
  | { kind: "migrate"; lc: PlanRow; uc: PlanRow; counts: AttachmentCounts }
  | { kind: "skip-no-counterpart"; lc: PlanRow; expectedCode: string }
  | { kind: "skip-counts-failed"; lc: PlanRow; error: string };

type AttachmentCounts = {
  subscriptions: number;
  prices: number;
  inheritedBy: number;
};

async function fetchAttachmentCounts(planId: string): Promise<AttachmentCounts> {
  const [subscriptions, prices, inheritedBy] = await Promise.all([
    prisma.userSubscription.count({ where: { planId } }),
    prisma.billingPlanPrice.count({ where: { planId } }),
    prisma.billingPlan.count({ where: { inheritsFromPlanId: planId } }),
  ]);
  return { subscriptions, prices, inheritedBy };
}

async function buildPlanActions(): Promise<CleanupAction[]> {
  const lowercasePlans = await prisma.billingPlan.findMany({
    where: { code: { in: Object.keys(LOWERCASE_TO_UPPERCASE) } },
    select: { id: true, code: true, tier: true, scope: true, isActive: true },
    orderBy: [{ scope: "asc" }, { tier: "asc" }],
  });

  if (lowercasePlans.length === 0) return [];

  const targetCodes = Object.values(LOWERCASE_TO_UPPERCASE);
  const targetPlans = await prisma.billingPlan.findMany({
    where: { code: { in: targetCodes } },
    select: { id: true, code: true, tier: true, scope: true, isActive: true },
  });
  const targetsByCode = new Map(targetPlans.map((p) => [p.code, p]));

  const actions: CleanupAction[] = [];
  for (const lc of lowercasePlans) {
    const expectedCode = LOWERCASE_TO_UPPERCASE[lc.code];
    if (!expectedCode) continue; // shouldn't happen — `where: in` filtered

    const uc = targetsByCode.get(expectedCode);
    if (!uc) {
      actions.push({ kind: "skip-no-counterpart", lc, expectedCode });
      continue;
    }

    try {
      const counts = await fetchAttachmentCounts(lc.id);
      actions.push({ kind: "migrate", lc, uc, counts });
    } catch (error) {
      actions.push({
        kind: "skip-counts-failed",
        lc,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return actions;
}

async function reportShortCodeLeftovers(): Promise<void> {
  const shortCodes = await prisma.billingPlan.findMany({
    where: { code: { in: [...SHORT_CODES] } },
    select: { id: true, code: true, tier: true, scope: true },
  });
  if (shortCodes.length === 0) return;
  console.log("");
  console.log("ℹ️  Short-code leftovers detected (NOT touched by this script):");
  for (const p of shortCodes) {
    console.log(`     ${p.code.padEnd(12)} ${p.tier}/${p.scope}  id=${p.id}`);
  }
  console.log("     Use `scripts/migrate-billing-plans.ts` to rename these in place.");
}

function printPlan(label: string, plan: PlanRow): void {
  console.log(
    `   ${label} ${plan.code.padEnd(16)} ${plan.tier.padEnd(8)} ${plan.scope.padEnd(7)} id=${plan.id} active=${plan.isActive}`,
  );
}

async function applyMigration(
  action: Extract<CleanupAction, { kind: "migrate" }>,
): Promise<void> {
  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // 1. Re-point active subscriptions to the UPPERCASE plan. We
      //    intentionally do NOT touch `scope` / `status` etc. — the
      //    UPPERCASE counterpart has the same scope by construction.
      await tx.userSubscription.updateMany({
        where: { planId: action.lc.id },
        data: { planId: action.uc.id },
      });

      // 2. Re-point any plan that inherits from the lowercase variant.
      //    Realistically zero in practice (lowercase plans are dead),
      //    but the schema permits it so we handle it.
      await tx.billingPlan.updateMany({
        where: { inheritsFromPlanId: action.lc.id },
        data: { inheritsFromPlanId: action.uc.id },
      });

      // 3. Delete the lowercase plan. `BillingPlanPrice.planId` has
      //    `onDelete: Cascade`, so its prices are dropped automatically
      //    — UPPERCASE keeps its own (separate row, separate prices).
      await tx.billingPlan.delete({ where: { id: action.lc.id } });
    },
    {
      // Conservative timeout — the heaviest step (updateMany on
      // UserSubscription) finishes in milliseconds for realistic
      // plan-sized datasets; 10 s leaves headroom for shadow indexes.
      timeout: 10_000,
    },
  );
}

async function main(): Promise<void> {
  const isDryRun = !process.argv.includes("--confirm");

  console.log(isDryRun ? "🔍 DRY RUN — no changes will be applied" : "🔥 LIVE RUN — changes WILL be applied");
  console.log("");

  const actions = await buildPlanActions();

  if (actions.length === 0) {
    console.log("✅ No lowercase duplicate plans found. Nothing to clean.");
    await reportShortCodeLeftovers();
    return;
  }

  console.log(`Found ${actions.length} lowercase plan${actions.length === 1 ? "" : "s"}:`);
  console.log("");

  let migrateOk = 0;
  let migrateFail = 0;
  let skippedMissing = 0;
  let skippedCounts = 0;

  for (const action of actions) {
    if (action.kind === "skip-no-counterpart") {
      console.log(`⚠️  ${action.lc.code} → SKIP (UPPERCASE counterpart ${action.expectedCode} not found)`);
      printPlan("   lowercase: ", action.lc);
      skippedMissing += 1;
      continue;
    }

    if (action.kind === "skip-counts-failed") {
      console.log(`⚠️  ${action.lc.code} → SKIP (attachment count query failed: ${action.error})`);
      skippedCounts += 1;
      continue;
    }

    console.log(`▶ ${action.lc.code} → ${action.uc.code}`);
    printPlan("   from:       ", action.lc);
    printPlan("   to:         ", action.uc);
    console.log(`   subscriptions to migrate:    ${action.counts.subscriptions}`);
    console.log(`   prices to drop (cascade):    ${action.counts.prices}`);
    console.log(`   inherit edges to re-point:   ${action.counts.inheritedBy}`);

    if (isDryRun) {
      console.log("   (dry run — no changes)");
      continue;
    }

    try {
      await applyMigration(action);
      console.log(`   ✅ migrated and deleted ${action.lc.code}`);
      migrateOk += 1;
    } catch (error) {
      console.log(`   ❌ failed: ${error instanceof Error ? error.message : String(error)}`);
      migrateFail += 1;
    }
    console.log("");
  }

  await reportShortCodeLeftovers();

  console.log("");
  console.log("──────────────────────────────");
  if (isDryRun) {
    console.log(`DRY RUN summary: ${actions.length} lowercase plans detected, 0 changed.`);
    console.log("Re-run with --confirm to apply.");
  } else {
    console.log(
      `Migrated: ${migrateOk}  Failed: ${migrateFail}  Skipped(no UC): ${skippedMissing}  Skipped(count error): ${skippedCounts}`,
    );

    const total = await prisma.billingPlan.count();
    console.log(`Total BillingPlan rows now: ${total}`);
    if (total !== 6) {
      console.log("⚠️  Expected 6 (the canonical UPPERCASE set). Manual review recommended.");
    }
  }
}

main()
  .catch((error) => {
    console.error("❌ cleanup-duplicate-billing-plans failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
