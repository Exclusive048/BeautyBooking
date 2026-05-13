/** Pure body builders for admin-initiated notifications. Centralised
 * so the wording stays consistent across the 5 dispatch sites and
 * so unit tests can pin down the reason-suffix / plurals behaviour. */

const RUBLE = "₽";

function formatRubles(kopeks: number): string {
  const whole = Math.round(kopeks / 100);
  return `${whole.toLocaleString("ru-RU")} ${RUBLE}`;
}

/** «1 месяц / 3 месяца / 12 месяцев» — Russian plural for months. */
export function formatMonths(value: number): string {
  const n = Math.abs(value);
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return `${value} месяцев`;
  const last = n % 10;
  if (last === 1) return `${value} месяц`;
  if (last >= 2 && last <= 4) return `${value} месяца`;
  return `${value} месяцев`;
}

function withReason(body: string, reason?: string | null): string {
  const trimmed = reason?.trim();
  if (!trimmed) return body;
  return `${body} Причина: ${trimmed}.`;
}

export function buildPlanGrantedBody(opts: {
  planName: string;
  periodMonths: number;
  reason?: string | null;
}): string {
  const period = formatMonths(opts.periodMonths);
  return withReason(
    `Администратор подарил тариф «${opts.planName}» на ${period}.`,
    opts.reason,
  );
}

export type PlanEditDiff = {
  name?: { before: string; after: string };
  isActive?: { before: boolean; after: boolean };
  /** Map period (e.g. `"3m"`) to kopeks-pair. Always before/after kopeks. */
  prices?: Record<string, { before: number; after: number }>;
};

/** Returns a human-readable summary string, or `null` if the diff
 * contains only changes too small to notify subscribers about
 * (sortOrder churn, no-op toggles, etc.). */
export function buildPlanEditedSummary(diff: PlanEditDiff): string | null {
  const parts: string[] = [];

  if (diff.name && diff.name.before !== diff.name.after) {
    parts.push(`название изменилось с «${diff.name.before}» на «${diff.name.after}»`);
  }

  if (diff.isActive) {
    parts.push(
      diff.isActive.after ? "тариф снова активен" : "тариф приостановлен",
    );
  }

  if (diff.prices) {
    for (const [period, value] of Object.entries(diff.prices)) {
      if (value.before === value.after) continue;
      const periodLabel = period.replace(/m$/, "");
      const months = Number.parseInt(periodLabel, 10);
      const label = Number.isFinite(months) ? formatMonths(months) : period;
      parts.push(
        `цена за ${label}: ${formatRubles(value.before)} → ${formatRubles(value.after)}`,
      );
    }
  }

  if (parts.length === 0) return null;

  return `В вашем тарифе изменились параметры — ${parts.join("; ")}.`;
}

export function buildSubscriptionCancelledByAdminBody(opts: {
  planName: string;
  accessUntil: Date | null;
  reason?: string | null;
}): string {
  const tail = opts.accessUntil
    ? `Доступ сохранится до ${formatDateRu(opts.accessUntil)}.`
    : "Доступ сохранится до конца оплаченного периода.";
  return withReason(
    `Подписка «${opts.planName}» отменена администратором. ${tail}`,
    opts.reason,
  );
}

export function buildRefundBody(opts: {
  amountKopeks: number;
  paymentMethodDisplay?: string | null;
  reason?: string | null;
}): string {
  const method = opts.paymentMethodDisplay?.trim();
  const head = method
    ? `Платёж на ${formatRubles(opts.amountKopeks)} возвращён на ${method}.`
    : `Платёж на ${formatRubles(opts.amountKopeks)} возвращён.`;
  return withReason(head, opts.reason);
}

export function buildReviewDeletedByAdminBody(opts: {
  targetName: string | null;
  reason?: string | null;
}): string {
  const target = opts.targetName?.trim();
  const head = target
    ? `Ваш отзыв о «${target}» удалён администратором.`
    : "Ваш отзыв удалён администратором.";
  return withReason(head, opts.reason);
}

function formatDateRu(date: Date): string {
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Push payload bodies must fit comfortably in the OS notification
 * shade — Chrome/Android start truncating around 200 chars. We hard-cap
 * at 200 with an ellipsis. Title is capped at 50. */
export const PUSH_BODY_MAX = 200;
export const PUSH_TITLE_MAX = 50;

export function truncatePushBody(body: string): string {
  if (body.length <= PUSH_BODY_MAX) return body;
  return `${body.slice(0, PUSH_BODY_MAX - 1)}…`;
}

export function truncatePushTitle(title: string): string {
  if (title.length <= PUSH_TITLE_MAX) return title;
  return `${title.slice(0, PUSH_TITLE_MAX - 1)}…`;
}
