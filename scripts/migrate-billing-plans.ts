/**
 * One-time migration: brings old billing plan codes/features into the new schema.
 *
 * Safe to run multiple times (idempotent).
 * Does NOT overwrite features that are already in the new format.
 *
 * Old codes  → new codes:
 *   free      → MASTER_FREE   (MASTER / FREE)
 *   premium   → MASTER_PREMIUM (MASTER / PREMIUM)
 *   studio_pro → STUDIO_PRO   (STUDIO / PRO)
 *   pro       → MASTER_PRO    (MASTER / PRO)
 *
 * Old feature keys → new keys:
 *   crm            → clientNotes + clientVisitHistory
 *   analytics      → analytics_dashboard
 *   analyticsCharts → analytics_revenue + analytics_clients +
 *                     analytics_booking_insights + analytics_cohorts + analytics_forecast
 *   maxTeamMasters: 0 → dropped (use seed default)
 *
 * Usage: npx tsx scripts/migrate-billing-plans.ts
 */
import { PrismaClient, SubscriptionScope } from "@prisma/client";
import { ensureDefaultPlans } from "../src/lib/billing/plan-seed";

const prisma = new PrismaClient();

// ─── Old code → target code + correct scope ────────────────────────────────
const CODE_MAP: Record<string, { newCode: string; newScope: SubscriptionScope }> = {
  free:       { newCode: "MASTER_FREE",    newScope: SubscriptionScope.MASTER },
  premium:    { newCode: "MASTER_PREMIUM", newScope: SubscriptionScope.MASTER },
  pro:        { newCode: "MASTER_PRO",     newScope: SubscriptionScope.MASTER },
  studio_pro: { newCode: "STUDIO_PRO",     newScope: SubscriptionScope.STUDIO },
};

// ─── Convert old features JSON → new catalog keys ─────────────────────────
function migrateFeatures(old: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};

  // Pass-through keys already in the new catalog
  const PASSTHROUGH = [
    "onlineBooking", "catalogListing", "pwaPush", "profilePublicPage",
    "onlinePayments", "hotSlots", "analytics_dashboard", "analytics_revenue",
    "analytics_clients", "analytics_booking_insights", "analytics_cohorts",
    "analytics_forecast", "financeReport", "notifications",
    "tgNotifications", "vkNotifications", "maxNotifications", "smsNotifications",
    "clientVisitHistory", "clientNotes", "clientImport", "highlightCard",
    "maxPortfolioPhotosSolo", "maxPortfolioPhotosStudioDesign",
    "maxPortfolioPhotosPerStudioMaster",
  ] as const;

  for (const key of PASSTHROUGH) {
    if (key in old) next[key] = old[key];
  }

  // Migrate maxTeamMasters — skip 0 (means "none", use seed default limit)
  if (typeof old.maxTeamMasters === "number" && old.maxTeamMasters > 0) {
    next.maxTeamMasters = old.maxTeamMasters;
  }

  // crm: true → clientNotes + clientVisitHistory
  if (old.crm === true) {
    next.clientNotes = true;
    next.clientVisitHistory = true;
  }

  // analytics: true → analytics_dashboard
  if (old.analytics === true) {
    next.analytics_dashboard = true;
  }

  // analyticsCharts: true → all chart analytics
  if (old.analyticsCharts === true) {
    next.analytics_revenue = true;
    next.analytics_clients = true;
    next.analytics_booking_insights = true;
    next.analytics_cohorts = true;
    next.analytics_forecast = true;
  }

  return next;
}

function hasOldKeys(features: Record<string, unknown>): boolean {
  return "crm" in features || "analytics" in features || "analyticsCharts" in features;
}

async function main() {
  console.log("🔍 Reading current plans from DB…");
  const plans = await prisma.billingPlan.findMany({
    select: { id: true, code: true, scope: true, tier: true, name: true, features: true },
  });
  console.log(`   Found ${plans.length} plans: ${plans.map((p) => p.code).join(", ")}`);

  // ── Step 1: Rename codes + fix scopes + migrate features ─────────────────
  for (const plan of plans) {
    const mapping = CODE_MAP[plan.code];
    const features = (plan.features ?? {}) as Record<string, unknown>;
    const needsFeatureMigration = hasOldKeys(features);
    const needsCodeChange = mapping && plan.code !== mapping.newCode;
    const needsScopeChange = mapping && plan.scope !== mapping.newScope;

    if (!needsCodeChange && !needsScopeChange && !needsFeatureMigration) {
      console.log(`   ✓ ${plan.code} — already up to date`);
      continue;
    }

    const updates: Record<string, unknown> = {};
    if (needsCodeChange)  { updates.code  = mapping.newCode; }
    if (needsScopeChange) { updates.scope = mapping.newScope; }
    if (needsFeatureMigration) { updates.features = migrateFeatures(features); }

    await prisma.billingPlan.update({
      where: { id: plan.id },
      data: updates as Parameters<typeof prisma.billingPlan.update>[0]["data"],
      select: { id: true },
    });

    const parts: string[] = [];
    if (needsCodeChange)      parts.push(`code: ${plan.code} → ${mapping.newCode}`);
    if (needsScopeChange)     parts.push(`scope: ${plan.scope} → ${mapping.newScope}`);
    if (needsFeatureMigration) parts.push("features migrated");
    console.log(`   ✎ ${plan.code}: ${parts.join(", ")}`);
  }

  // ── Step 2: Run official seed to create any missing plans & prices ────────
  console.log("\n📦 Running ensureDefaultPlans (creates missing plans, skips features on existing)…");
  await ensureDefaultPlans();

  // ── Step 3: Wire up inheritsFromPlanId ────────────────────────────────────
  console.log("\n🔗 Setting up inheritance chain…");
  const allPlans = await prisma.billingPlan.findMany({
    select: { id: true, code: true, inheritsFromPlanId: true },
  });
  const byCode = new Map(allPlans.map((p) => [p.code, p]));

  const INHERITANCE: Record<string, string> = {
    MASTER_PRO:      "MASTER_FREE",
    MASTER_PREMIUM:  "MASTER_PRO",
    STUDIO_PRO:      "STUDIO_FREE",
    STUDIO_PREMIUM:  "STUDIO_PRO",
  };

  for (const [childCode, parentCode] of Object.entries(INHERITANCE)) {
    const child  = byCode.get(childCode);
    const parent = byCode.get(parentCode);
    if (!child || !parent) {
      console.log(`   ⚠ Skipping ${childCode} → ${parentCode} (one not found)`);
      continue;
    }
    if (child.inheritsFromPlanId === parent.id) {
      console.log(`   ✓ ${childCode} → ${parentCode} already set`);
      continue;
    }
    await prisma.billingPlan.update({
      where: { id: child.id },
      data: { inheritsFromPlanId: parent.id },
      select: { id: true },
    });
    console.log(`   ✎ ${childCode} → inherits from ${parentCode}`);
  }

  // ── Step 4: Report final state ────────────────────────────────────────────
  console.log("\n📋 Final plan state:");
  const final = await prisma.billingPlan.findMany({
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }],
    select: {
      code: true, scope: true, tier: true, name: true,
      inheritsFromPlanId: true,
      prices: { select: { periodMonths: true, priceKopeks: true }, orderBy: { periodMonths: "asc" } },
    },
  });
  for (const p of final) {
    const monthly = p.prices.find((pr) => pr.periodMonths === 1);
    const parentCode = p.inheritsFromPlanId
      ? (final.find((f) => {
          const match = allPlans.find((a) => a.id === p.inheritsFromPlanId);
          return match && f.code === match.code;
        })?.code ?? p.inheritsFromPlanId)
      : "—";
    console.log(
      `   ${p.code.padEnd(18)} ${p.scope.padEnd(7)} ${p.tier.padEnd(8)} ` +
      `${String((monthly?.priceKopeks ?? 0) / 100).padStart(7)} ₽/mo  parent: ${parentCode}`
    );
  }

  console.log("\n✅ Migration complete.");
}

main()
  .catch((e) => {
    console.error("❌ Migration error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
