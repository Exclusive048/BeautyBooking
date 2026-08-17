import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateMRR, type MrrInput } from "@/lib/billing/mrr";
import { logInfo } from "@/lib/logging/logger";

/**
 * Truncates a `Date` to UTC midnight. Postgres `@db.Date` columns store
 * just YYYY-MM-DD, so we feed them values normalised to midnight UTC —
 * this is the same convention `cancelledAtUtc` / `startedAtUtc` use
 * elsewhere in the schema.
 */
function utcDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export type SnapshotData = {
  snapshotDate: Date;
  mrrKopeks: bigint;
  activeSubscriptionsCount: number;
};

export type CreateSnapshotResult = {
  /** `false` when today's row already existed and we returned it
   * untouched — keeps the endpoint idempotent for retried cron runs. */
  created: boolean;
  snapshot: SnapshotData;
};

/**
 * Resolves each *paying* subscription to a `{priceKopeks, periodMonths}`
 * tuple suitable for `calculateMRR`. The price is looked up via
 * `BillingPlanPrice` on the same `(planId, periodMonths)` tuple the
 * subscription was activated with — same lookup the renewal cron
 * uses, so MRR matches what would actually be billed.
 *
 * HARDENING-10 #14 — "paying" means status ACTIVE **and** non-trial **and**
 * within the paid period (`currentPeriodEnd > now`):
 *   - `isTrial: false` — never-billed trials contribute no revenue.
 *   - `currentPeriodEnd > now` — excludes perpetually-ACTIVE lapsed admin
 *     grants whose period has already ended (they're ACTIVE but not paid-current).
 *   - only `isActive` price rows are matched — a retired price row must not
 *     value a subscription at a stale amount.
 * This is *stricter* than the feature-access predicate `isSubscriptionActive`
 * (HARDENING-03): MRR is revenue, so it deliberately excludes the 7-day grace
 * window — a PAST_DUE-in-grace sub isn't billed (and is already excluded by
 * `status: ACTIVE` anyway). MRR and access agree on the paid-current core;
 * grace grants access but is not revenue.
 *
 * Subscriptions without a matching (active) price row contribute 0 — defensive
 * against orphan rows that pre-date a price config change.
 */
async function loadActiveSubscriptionMrrInputs(now: Date): Promise<MrrInput[]> {
  const subs = await prisma.userSubscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      isTrial: false,
      currentPeriodEnd: { gt: now },
    },
    select: {
      planId: true,
      periodMonths: true,
      plan: {
        select: {
          prices: {
            select: { periodMonths: true, priceKopeks: true, isActive: true },
          },
        },
      },
    },
  });

  return subs.map((sub) => {
    const match = sub.plan.prices.find(
      (p) => p.periodMonths === sub.periodMonths && p.isActive,
    );
    return {
      priceKopeks: match?.priceKopeks ?? 0,
      periodMonths: sub.periodMonths,
    };
  });
}

/**
 * Writes today's MRR snapshot. Idempotent — `snapshotDate` is `@unique`
 * so a second run on the same UTC day returns the existing row instead
 * of erroring or duplicating.
 *
 * Race-safe: if two cron firings happen concurrently, the second hits
 * the unique-violation path and falls back to read the winner's row.
 */
export async function createMrrSnapshotForToday(): Promise<CreateSnapshotResult> {
  const now = new Date();
  const today = utcDateOnly(now);

  const existing = await prisma.mrrSnapshot.findUnique({
    where: { snapshotDate: today },
    select: {
      snapshotDate: true,
      mrrKopeks: true,
      activeSubscriptionsCount: true,
    },
  });
  if (existing) {
    return { created: false, snapshot: existing };
  }

  const mrrInputs = await loadActiveSubscriptionMrrInputs(now);
  const mrrNumber = calculateMRR(mrrInputs);
  const mrrKopeks = BigInt(mrrNumber);
  const activeCount = mrrInputs.length;

  try {
    const created = await prisma.mrrSnapshot.create({
      data: {
        snapshotDate: today,
        mrrKopeks,
        activeSubscriptionsCount: activeCount,
      },
      select: {
        snapshotDate: true,
        mrrKopeks: true,
        activeSubscriptionsCount: true,
      },
    });

    logInfo("mrr.snapshot.created", {
      date: today.toISOString().slice(0, 10),
      mrrKopeks: mrrKopeks.toString(),
      activeCount,
    });

    return { created: true, snapshot: created };
  } catch (error) {
    // P2002 unique-violation = lost the race with another concurrent
    // cron run. Re-read and treat as `created: false`.
    const fallback = await prisma.mrrSnapshot.findUnique({
      where: { snapshotDate: today },
      select: {
        snapshotDate: true,
        mrrKopeks: true,
        activeSubscriptionsCount: true,
      },
    });
    if (fallback) {
      return { created: false, snapshot: fallback };
    }
    throw error;
  }
}

/**
 * RES-26 — с какого часа UTC воркер подбирает несделанный снимок.
 *
 * День снимка — UTC-день (`utcDateOnly`), поэтому час обязан лежать внутри
 * него: поздний оставляет внешний cron первичным (воркер не забегает вперёд),
 * но успевает измерить состояние до того, как дата сменится и измерять станет
 * нечего.
 */
export const MRR_SNAPSHOT_BACKSTOP_HOUR_UTC = 23;

export type BackstopResult =
  | { ran: false; reason: "too-early" }
  | { ran: true; created: boolean; snapshot: SnapshotData };

/**
 * Второй шанс ИЗМЕРИТЬ сегодняшний день — не бэкфилл (RES-26).
 *
 * Снимок держался на одном внешнем срабатывании cron'а в сутки: не сработало
 * (планировщик пропустил, воркер лежал дольше трёх попыток задачи) — и в ряду
 * навсегда дыра, которая проявится ровно через 30 дней, когда
 * `getMrrSnapshotDaysAgo` не найдёт строку на точную дату.
 *
 * 🔴 Дыру за ПРОШЕДШИЙ день закрыть нечем: `UserSubscription` хранит границы
 * периода одним изменяемым полем (продление перезаписывает), а `status` —
 * текущий, поэтому набор «кто был оплачен на дату D» из БД не восстанавливается.
 * Занижённая точка в денежном ряду хуже пропуска: пропуск виден как «—», а
 * занижение читается как падение выручки, которого не было — тот же принцип уже
 * записан у `getMrrSnapshotDaysAgo`. Поэтому подбор работает только по
 * сегодняшней дате и полностью переиспользует идемпотентный
 * `createMrrSnapshotForToday`.
 */
export async function runMrrSnapshotBackstop(now: Date = new Date()): Promise<BackstopResult> {
  if (now.getUTCHours() < MRR_SNAPSHOT_BACKSTOP_HOUR_UTC) {
    return { ran: false, reason: "too-early" };
  }

  const result = await createMrrSnapshotForToday();
  return { ran: true, created: result.created, snapshot: result.snapshot };
}

/**
 * Fetches the snapshot row for the day that was exactly `daysAgo`
 * before today (UTC). Returns `null` when no row exists for that
 * date — the KPI delta then falls back to "—" in the UI.
 *
 * No nearest-neighbour fallback by design: a missing snapshot is a
 * cron-health signal that should surface as `null`, not be silently
 * smoothed away by reading a different day.
 */
export async function getMrrSnapshotDaysAgo(
  daysAgo: number,
): Promise<Pick<SnapshotData, "mrrKopeks" | "activeSubscriptionsCount"> | null> {
  const target = utcDateOnly(new Date());
  target.setUTCDate(target.getUTCDate() - daysAgo);

  const snapshot = await prisma.mrrSnapshot.findUnique({
    where: { snapshotDate: target },
    select: { mrrKopeks: true, activeSubscriptionsCount: true },
  });
  return snapshot;
}
