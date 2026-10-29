/**
 * LAUNCH-PROMO-01 — стартовая акция: пока идёт бета-тестирование, все тарифы
 * бесплатны, и каждый кабинет мастера/студии получает максимальный тариф
 * (PREMIUM) до конца акции — по 31 декабря 2026 включительно (BETA-PROMO-DEC,
 * решение владельца 2026-10-29; было «до 1 ноября»).
 *
 * Продление — это ТОЛЬКО смена константы ниже: сид деплоя (`npm run seed:plans`
 * → `backfillLaunchPromo`) выдаёт акцию всем строкам, у которых `trialEndsAt`
 * раньше новой границы (`grantLaunchPromoInTx`, `alreadyPromo`), то есть уже
 * выданный «до 1 ноября» PREMIUM продлевается сам; платящих не трогает.
 *
 * Модуль чистый и client-safe (без Prisma, без env): его читают и серверные
 * пути (регистрация кабинета, checkout, сид деплоя), и кабинетная страница
 * подписки — граница акции должна быть одной на всех.
 *
 * Механика — существующий trial (`UserSubscription.isTrial` + `trialEndsAt`):
 * строка указывает на PREMIUM-план, `currentPeriodEnd = trialEndsAt = конец
 * акции`. После него trial-cron (`trial-cron.ts`) переводит строку на FREE
 * тем же путём, что и обычный пробный период, а доступ к фичам гаснет ещё
 * раньше крона — `isSubscriptionActive` сравнивает `currentPeriodEnd` с «сейчас».
 *
 * Источник времени — **UTC-tech** с якорем в Москве (rule 17): граница — полночь
 * 1 января 2027 по `Europe/Moscow` (он же `DEFAULT_TIMEZONE`), хранится как
 * момент UTC. Последний день акции по Москве — 31 декабря 2026; тексты называют
 * именно его, и их согласованность с константой держит `launch-promo.test.ts`.
 */

/** Полночь 1 января 2027 по Москве = 2026-12-31T21:00:00Z (акция — по 31 декабря включительно). */
export const LAUNCH_PROMO_ENDS_AT = new Date("2027-01-01T00:00:00+03:00");

/** Длительность обычного пробного PREMIUM после окончания акции. */
export const TRIAL_DURATION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isLaunchPromoActive(now: Date = new Date()): boolean {
  return now.getTime() < LAUNCH_PROMO_ENDS_AT.getTime();
}

/**
 * Когда закончится PREMIUM, выданный при регистрации кабинета в момент `now`:
 * во время акции — ровно в её конец (все получают максимальный тариф «до
 * 31 декабря»), после — обычные 30 дней пробного периода.
 */
export function resolveTrialEndsAt(now: Date = new Date()): Date {
  if (isLaunchPromoActive(now)) return new Date(LAUNCH_PROMO_ENDS_AT.getTime());
  return new Date(now.getTime() + TRIAL_DURATION_DAYS * DAY_MS);
}
