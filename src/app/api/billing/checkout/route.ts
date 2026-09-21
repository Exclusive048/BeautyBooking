import { z } from "zod";
import { Prisma, type BillingPaymentStatus } from "@prisma/client";
import { ok, fail } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createInitialPayment } from "@/lib/payments/yookassa/client";
import { BILLING_PERIODS } from "@/lib/billing/constants";
import { resolvePlanPrice } from "@/lib/billing/pricing";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { formatTimeBucketUtc, sha256 } from "@/lib/billing/utils";
import { isCurrentMasterManagedByStudio } from "@/lib/master/access";
import { invalidatePlanCache } from "@/lib/billing/get-current-plan";
import { isLaunchPromoActive } from "@/lib/billing/launch-promo";

export const runtime = "nodejs";

const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * Ответ на «платёж по этому ключу уже есть» (LOGIC-08).
 *
 * Вынесен, потому что таких мест теперь ДВА: последовательный дубль ловит
 * `findUnique` до создания, одновременный — `P2002` на самом создании. Две
 * копии лестницы разъехались бы, и разъехались бы именно на платёжном экране.
 */
function respondToExistingPayment(payment: {
  status: BillingPaymentStatus;
  confirmationUrl: string | null;
}) {
  if (payment.status === "PENDING" && payment.confirmationUrl) {
    return ok({ confirmationUrl: payment.confirmationUrl, reused: true });
  }
  if (payment.status === "SUCCEEDED") {
    return ok({ mode: "already-paid", reused: true });
  }
  if (payment.status === "PENDING") {
    // Победитель гонки ещё не сходил в ЮКассу — ссылки пока нет ни у кого.
    return ok({ mode: "pending", reused: true });
  }
  return fail("Платёж уже существует. Попробуйте позже.", 409, "PAYMENT_ALREADY_EXISTS");
}

const bodySchema = z.object({
  scope: z.enum(["MASTER", "STUDIO"]),
  planId: z.string().trim().min(1),
  periodMonths: z.number().int().refine((value) => BILLING_PERIODS.includes(value as (typeof BILLING_PERIODS)[number])),
  returnUrl: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Войдите в аккаунт, чтобы продолжить.", 401, "UNAUTHORIZED");

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return fail("Неверные данные оплаты.", 400, "VALIDATION_ERROR");
  }

  const { scope, planId, periodMonths, returnUrl } = parsed.data;

  if (scope === "MASTER") {
    const managedByStudio = await isCurrentMasterManagedByStudio(user.id);
    if (managedByStudio) {
      return fail("Тарифом мастера в студии управляет студия.", 403, "FORBIDDEN");
    }
  }

  const plan = await prisma.billingPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      code: true,
      name: true,
      tier: true,
      scope: true,
      isActive: true,
      // FIX-BC-1: fetch ALL active price rows so the shared resolver has both
      // the exact-period row and the monthly fallback (previously only a
      // filtered subset was fetched, which silently dropped the 3/6mo fallback
      // and ignored the stored 12mo row).
      prices: {
        where: { isActive: true },
        select: { periodMonths: true, priceKopeks: true },
      },
    },
  });

  if (!plan || !plan.isActive) {
    return fail("Тариф не найден.", 404, "NOT_FOUND");
  }
  if (plan.scope !== scope) {
    return fail("Этот тариф не подходит вашему кабинету. Выберите другой.", 400, "VALIDATION_ERROR");
  }

  const now = new Date();

  // LAUNCH-PROMO-01: до 1 ноября все тарифы бесплатны — у каждого кабинета
  // PREMIUM по акции, поэтому платный checkout не нужен и не проводится:
  // иначе человек заплатил бы за то, что у него и так есть.
  if (plan.tier !== "FREE" && isLaunchPromoActive(now)) {
    return fail(
      "До 1 ноября все тарифы бесплатны — у вас уже максимальный тариф. Оплата понадобится после 1 ноября.",
      409,
      "LAUNCH_PROMO_ACTIVE",
    );
  }
  const existing = await prisma.userSubscription.findUnique({
    where: { userId_scope: { userId: user.id, scope } },
    select: { id: true, status: true, planId: true },
  });

  // FIX-R2-05-B: the FREE tier activates without payment — decided by TIER, not by a
  // 0 price. This runs BEFORE the paid resolver so a FREE plan (which carries no
  // positive price rows) never 404s on "цена не найдена". Only paid tiers go through
  // `resolvePlanPrice`, where a 0/non-positive stored period now falls back to
  // monthly×N (never free) — so an admin cannot give away a paid term by leaving a
  // period at 0. A genuinely-free plan is the FREE tier, not a 0-priced PRO/PREMIUM.
  if (plan.tier === "FREE") {
    const subscription = await prisma.userSubscription.upsert({
      where: { userId_scope: { userId: user.id, scope } },
      create: {
        userId: user.id,
        scope,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: null,
        periodMonths,
        autoRenew: false,
        cancelAtPeriodEnd: false,
      },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: null,
        periodMonths,
        autoRenew: false,
        cancelAtPeriodEnd: false,
        graceUntil: null,
        nextBillingAt: null,
        // HARDENING-01 FIX-1: this branch activates a plan by mutating the
        // subscription directly (no webhook) — terminate any live trial here
        // too, or the trial cron would later "expire" a row that is already
        // on FREE and spam a bogus trial-expired notification.
        isTrial: false,
        trialEndsAt: null,
        trialEndingNotificationSentAt: null,
      },
      select: { id: true },
    });

    await invalidatePlanCache(user.id, scope);

    await createBillingAuditLog({
      userId: user.id,
      scope,
      subscriptionId: subscription.id,
      action: "FREE_ACTIVATED",
      details: { planId: plan.id, planCode: plan.code, periodMonths },
    });

    return ok({ mode: "free-activated" });
  }

  // FIX-BC-1: one shared resolver — same amount shown in the cabinet and charged at
  // renewal (no signup↔renewal divergence). FIX-R2-05-B: a 0/non-positive stored row
  // is treated as "no price" → monthly fallback; a paid period can never resolve to 0,
  // and the defensive `<= 0` guard ensures a paid checkout never creates a 0 payment.
  const priceKopeks = resolvePlanPrice(plan.prices, periodMonths);
  if (priceKopeks === null || priceKopeks <= 0) {
    return fail("Цена для выбранного срока не найдена.", 404, "NOT_FOUND");
  }

  let subscriptionId = existing?.id ?? null;
  if (!existing) {
    const created = await prisma.userSubscription.create({
      data: {
        userId: user.id,
        scope,
        planId: plan.id,
        status: "PENDING",
        startedAt: now,
        periodMonths,
        autoRenew: true,
        cancelAtPeriodEnd: false,
      },
      select: { id: true },
    });
    subscriptionId = created.id;
  } else if (existing.status !== "ACTIVE") {
    await prisma.userSubscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        status: "PENDING",
        periodMonths,
        autoRenew: true,
        cancelAtPeriodEnd: false,
      },
    });
  }
  // FIX-BC-2: do NOT mutate an ACTIVE subscription here when upgrading to a
  // different plan. Previously this set `cancelAtPeriodEnd:true, autoRenew:false`
  // BEFORE payment — so an *abandoned* upgrade silently downgraded a paying
  // customer at period end. The plan switch is now applied only by the success
  // webhook (`webhook-processor.ts`), which sets the new plan + a fresh period
  // and restores `autoRenew:true, cancelAtPeriodEnd:false`. An abandoned upgrade
  // leaves the active paid subscription completely untouched. The payment row is
  // still typed `UPGRADE` (below) so the webhook knows to switch the plan.

  if (!subscriptionId) {
    return fail("Не удалось создать подписку.", 500, "SUBSCRIPTION_ERROR");
  }

  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const recentPending = await prisma.billingPayment.findFirst({
    where: {
      subscriptionId,
      status: "PENDING",
      periodMonths,
      createdAt: { gte: thirtyMinutesAgo },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, confirmationUrl: true },
  });

  if (recentPending?.confirmationUrl) {
    return ok({ confirmationUrl: recentPending.confirmationUrl, reused: true });
  }

  const idempotenceKey = sha256(
    `${user.id}:${scope}:${plan.id}:${periodMonths}:${formatTimeBucketUtc(now)}`
  );

  const existingByKey = await prisma.billingPayment.findUnique({
    where: { idempotenceKey },
    select: { confirmationUrl: true, status: true },
  });

  if (existingByKey) {
    return respondToExistingPayment(existingByKey);
  }

  // LOGIC-08: `findUnique` выше и этот `create` — не атомарная пара, поэтому
  // два ОДНОВРЕМЕННЫХ клика по «Оплатить» оба читают пустоту и оба доходят
  // сюда. Второго платежа в ЮКассе при этом не возникает — `idempotenceKey
  // @unique` (инв. #4) срабатывает ДО обращения в API, — но проигравший
  // получал необработанный P2002, то есть сырой 500 на платёжном экране,
  // вместо задуманного `{ reused: true }` с той же ссылкой на оплату. Тот же
  // re-read-on-conflict, что в `mrr-snapshot.ts` и в шести auth-сайтах.
  let payment: { id: string };
  try {
    payment = await prisma.billingPayment.create({
      data: {
        subscriptionId,
        type: existing && existing.planId !== plan.id ? "UPGRADE" : "INITIAL",
        status: "PENDING",
        amountKopeks: priceKopeks,
        currency: "RUB",
        periodMonths,
        idempotenceKey,
        metadata: {
          userId: user.id,
          scope,
          planId: plan.id,
          planCode: plan.code,
          subscriptionId,
          periodMonths,
          type: existing && existing.planId !== plan.id ? "UPGRADE" : "INITIAL",
        },
      },
      select: { id: true },
    });
  } catch (error) {
    const isUniqueViolation =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_VIOLATION;
    if (!isUniqueViolation) throw error;

    const winner = await prisma.billingPayment.findUnique({
      where: { idempotenceKey },
      select: { confirmationUrl: true, status: true },
    });
    // Строки нет — значит конфликт был не по этому ключу; молчать нельзя.
    if (!winner) throw error;
    return respondToExistingPayment(winner);
  }

  await createBillingAuditLog({
    userId: user.id,
    scope,
    subscriptionId,
    paymentId: payment.id,
    action: "CHECKOUT_CREATED",
    details: { planId: plan.id, planCode: plan.code, periodMonths },
  });

  try {
    const yookassa = await createInitialPayment({
      amountKopeks: priceKopeks,
      description: `Подписка ${plan.name} на ${periodMonths} мес.`,
      returnUrl,
      idempotenceKey,
      metadata: {
        internalPaymentId: payment.id,
        userId: user.id,
        scope,
        planId: plan.id,
        planCode: plan.code,
        subscriptionId,
        periodMonths,
        type: existing && existing.planId !== plan.id ? "UPGRADE" : "INITIAL",
      },
    });

    await prisma.billingPayment.update({
      where: { id: payment.id },
      data: { yookassaPaymentId: yookassa.paymentId, confirmationUrl: yookassa.confirmationUrl },
    });

    return ok({ confirmationUrl: yookassa.confirmationUrl });
  } catch {
    await prisma.billingPayment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    return fail("Не удалось создать оплату.", 500, "PAYMENT_ERROR");
  }
}
