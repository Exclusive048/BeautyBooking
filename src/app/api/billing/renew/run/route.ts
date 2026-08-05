import { fail, ok } from "@/lib/api/response";
import { isAuthorizedCronRequest } from "@/lib/api/cron-auth";
import { prisma } from "@/lib/prisma";
import { createRecurringPayment } from "@/lib/payments/yookassa/client";
import { addMonthsUtc, sha256 } from "@/lib/billing/utils";
import { BILLING_PERIODS, PAST_DUE_GRACE_DAYS } from "@/lib/billing/constants";
import { resolvePlanPrice } from "@/lib/billing/pricing";
import { priceOptInDeadline, shouldEnterPriceOptIn } from "@/lib/billing/price-optin";
import { processPriceOptInReminders } from "@/lib/billing/price-optin-cron";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { createBillingNotification } from "@/lib/billing/notifications";
import { dateRU, moneyRUBFromKopeks } from "@/lib/format";
import { logError, logInfo } from "@/lib/logging/logger";
import { NotificationType, Prisma } from "@prisma/client";
import * as cache from "@/lib/cache/cache";
import { invalidatePlanCache } from "@/lib/billing/get-current-plan";
import { env } from "@/lib/env";
import { processTrialExpirations } from "@/lib/billing/trial-cron";
import { UI_TEXT } from "@/lib/ui/text";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// LOGIC-07: прогон биллинга — единственный в системе, и пересекаться сам с
// собой ему нечем: фазы 1-2 читают набор строк, а потом пишут аудит и
// уведомления НЕ идемпотентно (`updateMany` по статусу идемпотентен,
// `createMany` аудита и цикл уведомлений — нет). Ретрай внешнего планировщика
// поверх ещё работающего прогона поэтому стоил бы клиенту двух писем «подписка
// истекла» и двух строк в журнале.
const RUN_LOCK_KEY = "billing:renew:run";
// TTL — потолок, а не расписание: лок снимается в `finally`, а TTL страхует
// падение процесса между строками. Прогон ходит во внешний YooKassa на каждую
// подписку, поэтому запас крупный.
const RUN_LOCK_TTL_SECONDS = 30 * 60;

const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * Гигиенический лок прогона (LOGIC-07).
 *
 * **Fail-OPEN при недоступности Redis — осознанно.** `cache.setNx` бросает
 * (не возвращает `false`) при обрыве Redis, и различить «занято» от «Redis
 * лежит» здесь обязательно: отказ от прогона на время недоступности кэша
 * означает, что подписки не продлеваются и не истекают сутками — тихий ущерб,
 * который заметят позже, чем починят Redis. От **двойного списания** защищает
 * не этот лок, а `BillingPayment.idempotenceKey @unique` (инв. #4) плюс
 * idempotence-key на стороне YooKassa; лок убирает только дубли аудита и
 * уведомлений. Поэтому CLAUDE.md rule 10 (fail-closed на чувствительных
 * роутах) сюда не переносится: там fail-closed отказывает атакующему, здесь
 * отказал бы сам себе, не усилив денежную гарантию.
 */
async function acquireRunLock(): Promise<{ acquired: boolean; release: boolean }> {
  try {
    const acquired = await cache.setNx(RUN_LOCK_KEY, new Date().toISOString(), RUN_LOCK_TTL_SECONDS);
    return { acquired, release: acquired };
  } catch (error) {
    logError("Billing renewal run lock unavailable, proceeding without it", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { acquired: true, release: false };
  }
}

async function releaseRunLock(): Promise<void> {
  try {
    await cache.del(RUN_LOCK_KEY);
  } catch (error) {
    logError("Billing renewal run lock release failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Изоляция одного элемента батча (LOGIC-07).
 *
 * Цикл продлений ходит в БД и во внешний платёжный API на каждую подписку.
 * Без этой обёртки первое же исключение выбрасывалось из цикла и заканчивало
 * ВЕСЬ прогон: оставшиеся подписки не продлевались, а фазы после цикла
 * (trial-cron, price-optin-cron) не запускались вовсе.
 */
async function runIsolated(label: string, context: Record<string, unknown>, work: () => Promise<void>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (error) {
    logError(label, { ...context, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === PRISMA_UNIQUE_VIOLATION
  );
}

function formatDateKeyUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getGraceUntil(now: Date): Date {
  return new Date(now.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// POST /api/billing/renew/run
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // SEC-21: только заголовок `x-cron-token`. Query-строка попадает в access-логи
  // балансировщика и в реферер — секрету там не место.
  if (!isAuthorizedCronRequest(req, env.BILLING_RENEW_SECRET)) {
    return fail("Доступ запрещён.", 403, "FORBIDDEN");
  }

  const lock = await acquireRunLock();
  if (!lock.acquired) {
    logInfo("Billing renewal cron skipped: previous run still in progress", { key: RUN_LOCK_KEY });
    return fail("Прогон продлений уже выполняется.", 409, "CONFLICT");
  }

  try {
    return ok(await runBillingCron());
  } finally {
    if (lock.release) {
      await releaseRunLock();
    }
  }
}

async function runBillingCron() {
  const now = new Date();
  const graceUntil = getGraceUntil(now);

  // ─── 1. Expire overdue subscriptions past grace period ───────────────────

  const overdue = await prisma.userSubscription.findMany({
    where: { status: "PAST_DUE", graceUntil: { lt: now } },
    select: { id: true, userId: true, scope: true, pendingPriceOptIn: true },
  });

  if (overdue.length > 0) {
    await prisma.userSubscription.updateMany({
      where: { id: { in: overdue.map((s) => s.id) } },
      // BILLING-RENEWAL-OPTIN-02: clear opt-in flags on lapse too — an EXPIRED
      // row must never carry a stale pendingPriceOptIn / markers.
      data: {
        status: "EXPIRED",
        autoRenew: false,
        pendingPriceOptIn: false,
        pendingPriceKopeks: null,
        priceOptIn24hSentAt: null,
        priceOptIn2hSentAt: null,
      },
    });

    await prisma.billingAuditLog.createMany({
      data: overdue.map((s) => ({
        userId: s.userId,
        scope: s.scope,
        subscriptionId: s.id,
        action: "SUBSCRIPTION_EXPIRED",
        // A price-opt-in sub that lapsed declined the higher price (never
        // force-charged); distinguish it from a plain payment-failure grace.
        details: { reason: s.pendingPriceOptIn ? "PRICE_OPTIN_DECLINED" : "PAST_DUE_GRACE_EXPIRED" },
      })),
    });

    for (const s of overdue) {
      // LOGIC-07: статус уже переведён `updateMany` выше — провал уведомления
      // одному подписчику не должен стоить прогона остальным.
      await runIsolated("Billing expiry notification failed", { subscriptionId: s.id }, async () => {
        await invalidatePlanCache(s.userId, s.scope);
        await createBillingNotification({
          userId: s.userId,
          type: NotificationType.BILLING_SUBSCRIPTION_EXPIRED,
          title: s.pendingPriceOptIn
            ? UI_TEXT.billing.priceOptIn.lapsedTitle
            : "Подписка истекла",
          body: s.pendingPriceOptIn
            ? UI_TEXT.billing.priceOptIn.lapsedBody
            : "Льготный период оплаты истёк. Подписка отключена.",
          payloadJson: { scope: s.scope, subscriptionId: s.id },
        });
      });
    }
  }

  // ─── 2. Cancel subscriptions marked for cancellation at period end ────────

  const cancelCandidates = await prisma.userSubscription.findMany({
    where: {
      status: "ACTIVE",
      cancelAtPeriodEnd: true,
      nextBillingAt: { lte: now },
    },
    select: { id: true, userId: true, scope: true, plan: { select: { name: true } } },
  });

  if (cancelCandidates.length > 0) {
    await prisma.userSubscription.updateMany({
      where: { id: { in: cancelCandidates.map((s) => s.id) } },
      data: { status: "CANCELLED", autoRenew: false },
    });

    await prisma.billingAuditLog.createMany({
      data: cancelCandidates.map((s) => ({
        userId: s.userId,
        scope: s.scope,
        subscriptionId: s.id,
        action: "SUBSCRIPTION_CANCELLED",
        details: { reason: "CANCEL_AT_PERIOD_END" },
      })),
    });

    for (const s of cancelCandidates) {
      // LOGIC-07: та же изоляция, что и в фазе 1.
      await runIsolated("Billing cancellation notification failed", { subscriptionId: s.id }, async () => {
        await invalidatePlanCache(s.userId, s.scope);
        await createBillingNotification({
          userId: s.userId,
          type: NotificationType.BILLING_SUBSCRIPTION_CANCELLED,
          title: "Подписка завершена",
          body: `Подписка ${s.plan.name} завершена.`,
          payloadJson: { scope: s.scope, subscriptionId: s.id },
        });
      });
    }
  }

  // ─── 3. Renew active subscriptions due for billing ────────────────────────

  const candidates = await prisma.userSubscription.findMany({
    where: {
      status: "ACTIVE",
      autoRenew: true,
      cancelAtPeriodEnd: false,
      nextBillingAt: { lte: now },
    },
    select: {
      id: true,
      userId: true,
      scope: true,
      planId: true,
      periodMonths: true,
      paymentMethodId: true,
      plan: { select: { code: true, name: true } },
    },
  });

  let renewed = 0;
  let processed = 0;
  let failed = 0;

  // LOGIC-07: тело цикла вынесено во вложенную функцию — так каждый элемент
  // батча получает собственную границу ошибки (`runIsolated` ниже), а `continue`
  // становится `return` без изменения самой логики ветвей.
  async function processCandidate(subscription: (typeof candidates)[number]): Promise<void> {
    if (!BILLING_PERIODS.includes(subscription.periodMonths as (typeof BILLING_PERIODS)[number])) {
      return;
    }

    // No saved payment method → move to grace period
    if (!subscription.paymentMethodId) {
      await prisma.userSubscription.update({
        where: { id: subscription.id },
        data: { status: "PAST_DUE", graceUntil },
      });
      await createBillingAuditLog({
        userId: subscription.userId,
        scope: subscription.scope,
        subscriptionId: subscription.id,
        action: "RENEWAL_FAILED",
        details: { reason: "NO_PAYMENT_METHOD" },
      });
      await createBillingNotification({
        userId: subscription.userId,
        type: NotificationType.BILLING_PAYMENT_FAILED,
        title: "Не удалось списать оплату",
        body: "Для продления подписки требуется подтвердить способ оплаты.",
        payloadJson: { scope: subscription.scope, subscriptionId: subscription.id },
      });
      return;
    }

    // FIX-BC-1: resolve the renewal amount with the SAME shared resolver the
    // checkout/cabinet uses — so a sub renews at exactly the amount it signed up
    // for, and a period whose exact `BillingPlanPrice` row is absent falls back
    // to the monthly-derived price (instead of silently expiring a paying
    // subscriber on a valid card). `null` only when even the monthly row is
    // gone → surfaced as RENEWAL_FAILED/MISSING_PRICE + grace (admin-visible,
    // not silent), identical policy to checkout's 404.
    const activePrices = await prisma.billingPlanPrice.findMany({
      where: { planId: subscription.planId, isActive: true },
      select: { periodMonths: true, priceKopeks: true },
    });
    const resolvedPriceKopeks = resolvePlanPrice(activePrices, subscription.periodMonths);

    if (resolvedPriceKopeks === null) {
      await prisma.userSubscription.update({
        where: { id: subscription.id },
        data: { status: "PAST_DUE", graceUntil },
      });
      await createBillingAuditLog({
        userId: subscription.userId,
        scope: subscription.scope,
        subscriptionId: subscription.id,
        action: "RENEWAL_FAILED",
        details: { reason: "MISSING_PRICE" },
      });
      return;
    }

    // BILLING-RENEWAL-OPTIN-02 (R2-05-C-v2): a renewal whose effective price is
    // HIGHER than what the subscriber last actually paid must NOT auto-charge.
    // Enter a 2-day opt-in window (PAST_DUE + graceUntil = deadline) — access is
    // preserved via HARDENING-03 grace; the higher amount is charged ONLY if the
    // subscriber explicitly accepts (checkout at the new price). Equal/lower
    // price, or no prior SUCCEEDED payment → falls through to the normal
    // (byte-identical) auto-renew below. This branch NEVER calls
    // createRecurringPayment — a non-opting subscriber lapses via the §1 expiry
    // path, never force-charged the higher amount.
    const lastSucceeded = await prisma.billingPayment.findFirst({
      where: { subscriptionId: subscription.id, status: "SUCCEEDED" },
      select: { amountKopeks: true },
      orderBy: { createdAt: "desc" },
    });
    if (shouldEnterPriceOptIn(resolvedPriceKopeks, lastSucceeded?.amountKopeks ?? null)) {
      const deadline = priceOptInDeadline(now);
      await prisma.userSubscription.update({
        where: { id: subscription.id },
        data: {
          status: "PAST_DUE",
          graceUntil: deadline,
          pendingPriceOptIn: true,
          pendingPriceKopeks: resolvedPriceKopeks,
          priceOptIn24hSentAt: null,
          priceOptIn2hSentAt: null,
        },
      });
      await createBillingAuditLog({
        userId: subscription.userId,
        scope: subscription.scope,
        subscriptionId: subscription.id,
        action: "RENEWAL_PRICE_OPTIN_STARTED",
        details: {
          oldPriceKopeks: lastSucceeded?.amountKopeks ?? null,
          newPriceKopeks: resolvedPriceKopeks,
          periodMonths: subscription.periodMonths,
          deadline: deadline.toISOString(),
        },
      });
      await invalidatePlanCache(subscription.userId, subscription.scope);
      await createBillingNotification({
        userId: subscription.userId,
        type: NotificationType.BILLING_RENEWAL_PRICE_INCREASE,
        scope: subscription.scope,
        title: UI_TEXT.billing.priceOptIn.startedTitle,
        body: UI_TEXT.billing.priceOptIn.startedBody(
          moneyRUBFromKopeks(resolvedPriceKopeks),
          dateRU(deadline),
        ),
        payloadJson: {
          scope: subscription.scope,
          subscriptionId: subscription.id,
          newPriceKopeks: resolvedPriceKopeks,
          deadline: deadline.toISOString(),
        },
      });
      return;
    }

    // Idempotency: check if a payment was already initiated today
    const idempotenceKey = sha256(`renew:${subscription.id}:${formatDateKeyUtc(now)}`);
    const existing = await prisma.billingPayment.findUnique({
      where: { idempotenceKey },
      select: { id: true, status: true, confirmationUrl: true },
    });

    if (existing) {
      if (existing.status === "SUCCEEDED") return;

      if (existing.status === "PENDING") {
        await prisma.userSubscription.update({
          where: { id: subscription.id },
          data: { status: "PAST_DUE", graceUntil },
        });

        if (existing.confirmationUrl) {
          await createBillingNotification({
            userId: subscription.userId,
            type: NotificationType.BILLING_RENEWAL_CONFIRMATION_REQUIRED,
            title: "Подтвердите оплату",
            body: "Для продления подписки требуется подтвердить платёж.",
            payloadJson: {
              scope: subscription.scope,
              subscriptionId: subscription.id,
              confirmationUrl: existing.confirmationUrl,
            },
          });
        } else {
          logError("Renewal payment pending without confirmation URL", {
            paymentId: existing.id,
            subscriptionId: subscription.id,
          });
        }

        await createBillingAuditLog({
          userId: subscription.userId,
          scope: subscription.scope,
          subscriptionId: subscription.id,
          paymentId: existing.id,
          action: "RENEWAL_NEEDS_CONFIRMATION",
          details: { confirmationUrl: existing.confirmationUrl },
        });
        return;
      }

      // Payment in any other terminal failed state
      await prisma.userSubscription.update({
        where: { id: subscription.id },
        data: { status: "PAST_DUE", graceUntil },
      });
      await createBillingAuditLog({
        userId: subscription.userId,
        scope: subscription.scope,
        subscriptionId: subscription.id,
        paymentId: existing.id,
        action: "RENEWAL_FAILED",
        details: { reason: `EXISTING_${existing.status}` },
      });
      return;
    }

    // Create internal payment record before calling YooKassa.
    //
    // LOGIC-07: `findUnique` выше и этот `create` — не атомарная пара, поэтому
    // проигравший гонку получает P2002 на `idempotenceKey @unique` (инв. #4).
    // Это и есть работающая защита от двойного списания: проигравший НЕ доходит
    // до `createRecurringPayment`. Раньше исключение выбрасывалось из цикла и
    // хоронило весь прогон — теперь оно читается как «эту подписку уже взял
    // другой прогон» и стоит одной пропущенной строки, а не дня.
    let payment: { id: string };
    try {
      payment = await prisma.billingPayment.create({
        data: {
          subscriptionId: subscription.id,
          type: "RENEWAL",
          status: "PENDING",
          amountKopeks: resolvedPriceKopeks,
          currency: "RUB",
          periodMonths: subscription.periodMonths,
          idempotenceKey,
          metadata: {
            userId: subscription.userId,
            scope: subscription.scope,
            planId: subscription.planId,
            planCode: subscription.plan.code,
            subscriptionId: subscription.id,
            periodMonths: subscription.periodMonths,
            type: "RENEWAL",
          },
        },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        logInfo("Renewal payment already claimed by a concurrent run", {
          subscriptionId: subscription.id,
        });
        return;
      }
      throw error;
    }

    try {
      const yookassa = await createRecurringPayment({
        amountKopeks: resolvedPriceKopeks,
        paymentMethodId: subscription.paymentMethodId,
        description: `Автопродление ${subscription.plan.name}`,
        idempotenceKey,
        metadata: {
          internalPaymentId: payment.id,
          userId: subscription.userId,
          scope: subscription.scope,
          planId: subscription.planId,
          planCode: subscription.plan.code,
          subscriptionId: subscription.id,
          periodMonths: subscription.periodMonths,
          type: "RENEWAL",
        },
      });

      if (yookassa.status === "succeeded") {
        const periodStart = now;
        const periodEnd = addMonthsUtc(periodStart, subscription.periodMonths);

        await prisma.billingPayment.update({
          where: { id: payment.id },
          data: { status: "SUCCEEDED", yookassaPaymentId: yookassa.paymentId },
        });
        await prisma.userSubscription.update({
          where: { id: subscription.id },
          data: {
            status: "ACTIVE",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextBillingAt: periodEnd,
            graceUntil: null,
            lastPaymentAt: now,
          },
        });
        await createBillingAuditLog({
          userId: subscription.userId,
          scope: subscription.scope,
          subscriptionId: subscription.id,
          paymentId: payment.id,
          action: "RENEWAL_SUCCEEDED",
          details: { periodMonths: subscription.periodMonths },
        });
        await createBillingNotification({
          userId: subscription.userId,
          type: NotificationType.BILLING_PAYMENT_SUCCEEDED,
          title: "Оплата прошла",
          body: "Подписка успешно продлена.",
          payloadJson: { scope: subscription.scope, subscriptionId: subscription.id },
        });
        renewed += 1;
        return;
      }

      if (yookassa.status === "pending") {
        await prisma.billingPayment.update({
          where: { id: payment.id },
          data: {
            status: "PENDING",
            yookassaPaymentId: yookassa.paymentId,
            confirmationUrl: yookassa.confirmationUrl,
          },
        });
        await prisma.userSubscription.update({
          where: { id: subscription.id },
          data: { status: "PAST_DUE", graceUntil },
        });
        await createBillingAuditLog({
          userId: subscription.userId,
          scope: subscription.scope,
          subscriptionId: subscription.id,
          paymentId: payment.id,
          action: "RENEWAL_NEEDS_CONFIRMATION",
          details: { confirmationUrl: yookassa.confirmationUrl },
        });
        await createBillingNotification({
          userId: subscription.userId,
          type: NotificationType.BILLING_RENEWAL_CONFIRMATION_REQUIRED,
          title: "Подтвердите оплату",
          body: "Банк запросил подтверждение платежа для продления подписки.",
          payloadJson: {
            scope: subscription.scope,
            subscriptionId: subscription.id,
            confirmationUrl: yookassa.confirmationUrl,
          },
        });
        return;
      }

      // Payment failed immediately
      await prisma.billingPayment.update({
        where: { id: payment.id },
        data: { status: "FAILED", yookassaPaymentId: yookassa.paymentId },
      });
      await prisma.userSubscription.update({
        where: { id: subscription.id },
        data: { status: "PAST_DUE", graceUntil },
      });
      await createBillingAuditLog({
        userId: subscription.userId,
        scope: subscription.scope,
        subscriptionId: subscription.id,
        paymentId: payment.id,
        action: "RENEWAL_FAILED",
        details: { status: yookassa.status },
      });
      await createBillingNotification({
        userId: subscription.userId,
        type: NotificationType.BILLING_PAYMENT_FAILED,
        title: "Не удалось списать оплату",
        body: "Оплата продления не прошла. Проверьте способ оплаты.",
        payloadJson: { scope: subscription.scope, subscriptionId: subscription.id },
      });
    } catch (err) {
      logError("YooKassa recurring payment request failed", {
        subscriptionId: subscription.id,
        paymentId: payment.id,
        error: err instanceof Error ? err.message : String(err),
      });

      await prisma.billingPayment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
      await prisma.userSubscription.update({
        where: { id: subscription.id },
        data: { status: "PAST_DUE", graceUntil },
      });
      await createBillingAuditLog({
        userId: subscription.userId,
        scope: subscription.scope,
        subscriptionId: subscription.id,
        paymentId: payment.id,
        action: "RENEWAL_FAILED",
        details: { reason: "REQUEST_FAILED" },
      });
      await createBillingNotification({
        userId: subscription.userId,
        type: NotificationType.BILLING_PAYMENT_FAILED,
        title: "Не удалось списать оплату",
        body: "Попробуйте снова или обновите способ оплаты.",
        payloadJson: { scope: subscription.scope, subscriptionId: subscription.id },
      });
    }
  }

  for (const subscription of candidates) {
    const okItem = await runIsolated(
      "Billing renewal failed for subscription",
      { subscriptionId: subscription.id, userId: subscription.userId },
      () => processCandidate(subscription),
    );
    if (okItem) {
      processed += 1;
    } else {
      failed += 1;
    }
  }

  // ─── 4. Alert on stuck PENDING payments (older than 1 hour) ──────────────

  const stuck = await prisma.billingPayment.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) },
    },
    select: { id: true, subscriptionId: true, createdAt: true },
  });

  if (stuck.length > 0) {
    logError("Billing payments stuck in PENDING", {
      count: stuck.length,
      paymentIds: stuck.map((p) => p.id),
    });
  }

  // Trial expirations — warn 3 days before, downgrade to FREE on expiry.
  // Wrapped so any failure in trial logic doesn't kill the rest of the cron run.
  let trialExpirations = { warned: 0, warnErrors: 0, downgraded: 0, downgradeErrors: 0 };
  try {
    trialExpirations = await processTrialExpirations(now);
  } catch (error) {
    logError("processTrialExpirations failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Price-increase opt-in reminders (24h/2h before the opt-in deadline).
  // Wrapped so a reminder failure doesn't kill the rest of the cron run.
  let priceOptInReminders = { sent24h: 0, sent2h: 0, errors: 0 };
  try {
    priceOptInReminders = await processPriceOptInReminders(now);
  } catch (error) {
    logError("processPriceOptInReminders failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // LOGIC-07: сводка вместо прежнего `renewed: candidates.length` — то число
  // было количеством КАНДИДАТОВ, а не продлений, и при обрыве батча прогон
  // отдавал 500 без единого признака того, кто успел обработаться.
  return {
    ok: true,
    renewals: { candidates: candidates.length, processed, failed, renewed },
    trialExpirations,
    priceOptInReminders,
  };
}