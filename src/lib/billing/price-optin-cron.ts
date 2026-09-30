import { NotificationType, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logInfo } from "@/lib/logging/logger";
import { createBillingNotification } from "@/lib/billing/notifications";
import {
  PRICE_OPTIN_REMINDER_2H_MS,
  PRICE_OPTIN_REMINDER_24H_MS,
} from "@/lib/billing/price-optin";
import {
  formatBillingDeadlineLabel,
  resolveSubscriptionTimezone,
} from "@/lib/billing/deadline-label";
import { moneyRUBFromKopeks } from "@/lib/format";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * BILLING-RENEWAL-OPTIN-02 (R2-05-C-v2) — price-increase opt-in reminders.
 *
 * Scan approach (restart-robust, mirrors the trial-warning stage): the already-
 * running renewal cron calls this, which selects opt-in-pending subscriptions
 * whose deadline (`graceUntil`) is approaching and sends one `BILLING_RENEWAL_
 * PRICE_INCREASE` reminder at ~24h and ~2h before the deadline. Idempotent via
 * `priceOptIn24hSentAt` / `priceOptIn2hSentAt` sent-markers — a re-run doesn't
 * re-send. Non-overlapping bands (24h band excludes the final 2h window) so a
 * subscription never receives both reminders in one scan.
 *
 * Not delayed queue jobs by design: a Redis flush would silently drop a
 * scheduled reminder and lapse a subscriber without warning; a deadline scan
 * over durable DB state survives any worker/queue restart.
 */

const BATCH_SIZE = 100;

export type PriceOptInRemindersResult = {
  sent24h: number;
  sent2h: number;
  errors: number;
};

async function sendReminder(sub: {
  id: string;
  userId: string;
  scope: "MASTER" | "STUDIO";
  pendingPriceKopeks: number | null;
  graceUntil: Date | null;
}): Promise<void> {
  const priceLabel =
    sub.pendingPriceKopeks !== null ? moneyRUBFromKopeks(sub.pendingPriceKopeks) : "";
  // LOGIC-25: tz-источник — salon-tz кабинета, за который платит подписка.
  // Метка зоны обязательна: у cron-уведомления нет зрителя (см.
  // `deadline-label.ts`).
  const timeZone = await resolveSubscriptionTimezone(sub.userId, sub.scope);
  const deadlineLabel = formatBillingDeadlineLabel(sub.graceUntil, timeZone);
  await createBillingNotification({
    userId: sub.userId,
    type: NotificationType.BILLING_RENEWAL_PRICE_INCREASE,
    scope: sub.scope,
    title: UI_TEXT.billing.priceOptIn.reminderTitle,
    body: UI_TEXT.billing.priceOptIn.reminderBody(priceLabel, deadlineLabel),
    payloadJson: {
      scope: sub.scope,
      subscriptionId: sub.id,
      newPriceKopeks: sub.pendingPriceKopeks,
      deadline: sub.graceUntil?.toISOString() ?? null,
    },
  });
}

export async function processPriceOptInReminders(
  now: Date = new Date(),
): Promise<PriceOptInRemindersResult> {
  let sent24h = 0;
  let sent2h = 0;
  let errors = 0;

  const in2h = new Date(now.getTime() + PRICE_OPTIN_REMINDER_2H_MS);
  const in24h = new Date(now.getTime() + PRICE_OPTIN_REMINDER_24H_MS);

  // ── 24h band: deadline in (now+2h, now+24h], 24h reminder not yet sent. ──
  const due24h = await prisma.userSubscription.findMany({
    where: {
      pendingPriceOptIn: true,
      status: SubscriptionStatus.PAST_DUE,
      priceOptIn24hSentAt: null,
      graceUntil: { gt: in2h, lte: in24h },
    },
    select: { id: true, userId: true, scope: true, pendingPriceKopeks: true, graceUntil: true },
    take: BATCH_SIZE,
  });

  for (const sub of due24h) {
    try {
      await sendReminder(sub);
      await prisma.userSubscription.update({
        where: { id: sub.id },
        data: { priceOptIn24hSentAt: now },
      });
      sent24h += 1;
    } catch (error) {
      errors += 1;
      logError("Price opt-in 24h reminder failed", {
        subscriptionId: sub.id,
        userId: sub.userId,
        scope: sub.scope,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ── 2h band: deadline in (now, now+2h], 2h reminder not yet sent. ──
  const due2h = await prisma.userSubscription.findMany({
    where: {
      pendingPriceOptIn: true,
      status: SubscriptionStatus.PAST_DUE,
      priceOptIn2hSentAt: null,
      graceUntil: { gt: now, lte: in2h },
    },
    select: { id: true, userId: true, scope: true, pendingPriceKopeks: true, graceUntil: true },
    take: BATCH_SIZE,
  });

  for (const sub of due2h) {
    try {
      await sendReminder(sub);
      await prisma.userSubscription.update({
        where: { id: sub.id },
        data: { priceOptIn2hSentAt: now },
      });
      sent2h += 1;
    } catch (error) {
      errors += 1;
      logError("Price opt-in 2h reminder failed", {
        subscriptionId: sub.id,
        userId: sub.userId,
        scope: sub.scope,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (sent24h > 0 || sent2h > 0 || errors > 0) {
    logInfo("Price opt-in reminders processed", { sent24h, sent2h, errors });
  }

  return { sent24h, sent2h, errors };
}
