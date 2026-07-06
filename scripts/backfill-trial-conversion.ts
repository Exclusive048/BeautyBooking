/**
 * Backfill: clear trial flags on subscriptions that converted to paid.
 *
 * Background — HARDENING-01 FIX-1 (bug hunt 2026-07-06, finding #1):
 *   Before the fix, the `payment.succeeded` webhook re-anchored a mid-trial
 *   payer's subscription (status/planId/currentPeriodEnd/lastPaymentAt) but
 *   never cleared `isTrial` / `trialEndsAt` / `trialEndingNotificationSentAt`.
 *   At day 30 the trial cron would select the still-flagged row and force the
 *   PAYING subscriber down to FREE. The webhook now clears the flags in the
 *   same grant update, and the cron carries a defense-in-depth skip — this
 *   script repairs rows written BEFORE those fixes landed.
 *
 * Selection: `isTrial = true AND status = ACTIVE` with evidence of successful
 * payment — `lastPaymentAt` set OR a SUCCEEDED BillingPayment linked to the
 * subscription. For each match the trial flags are cleared in place
 * (`isTrial=false, trialEndsAt=null, trialEndingNotificationSentAt=null`);
 * nothing else is touched — plan/period/status stay as the payment grant left
 * them.
 *
 * Idempotent: a re-run after a successful apply finds no matching rows
 * (isTrial is already false) and exits with a no-op message.
 *
 * NOTE: since real webhooks were blocked until HARDENING-02 (finding #2),
 * production likely contains zero affected rows — this script is a safety
 * net, not a rescue. Run it once against staging/production before launch.
 *
 * USAGE:
 *   npx tsx scripts/backfill-trial-conversion.ts          # DRY RUN (default)
 *   npx tsx scripts/backfill-trial-conversion.ts --apply  # actually write
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODE: APPLY (writing changes)" : "MODE: DRY RUN (no writes; pass --apply to write)");

  const affected = await prisma.userSubscription.findMany({
    where: {
      isTrial: true,
      status: "ACTIVE",
      OR: [{ lastPaymentAt: { not: null } }, { payments: { some: { status: "SUCCEEDED" } } }],
    },
    select: {
      id: true,
      userId: true,
      scope: true,
      planId: true,
      trialEndsAt: true,
      lastPaymentAt: true,
      currentPeriodEnd: true,
      plan: { select: { code: true, tier: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (affected.length === 0) {
    console.log("Nothing to backfill: no ACTIVE trial-flagged subscriptions with payment evidence.");
    return;
  }

  console.log(`Found ${affected.length} converted-but-still-trial-flagged subscription(s):`);
  for (const sub of affected) {
    console.log(
      [
        `  subscription=${sub.id}`,
        `user=${sub.userId}`,
        `scope=${sub.scope}`,
        `plan=${sub.plan.code} (${sub.plan.tier})`,
        `trialEndsAt=${sub.trialEndsAt?.toISOString() ?? "null"}`,
        `lastPaymentAt=${sub.lastPaymentAt?.toISOString() ?? "null"}`,
        `currentPeriodEnd=${sub.currentPeriodEnd?.toISOString() ?? "null"}`,
      ].join(" "),
    );
  }

  if (!apply) {
    console.log("DRY RUN complete — no changes written. Re-run with --apply to clear the trial flags above.");
    return;
  }

  let cleared = 0;
  for (const sub of affected) {
    await prisma.userSubscription.update({
      where: { id: sub.id },
      data: { isTrial: false, trialEndsAt: null, trialEndingNotificationSentAt: null },
    });
    cleared += 1;
    console.log(`  cleared trial flags: subscription=${sub.id}`);
  }

  console.log(`APPLY complete — trial flags cleared on ${cleared} subscription(s).`);
  console.log(
    "Plan cache note: cleared rows keep their paid plan; the short-TTL plan cache converges on its own.",
  );
}

main()
  .catch((error) => {
    console.error("backfill-trial-conversion failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
