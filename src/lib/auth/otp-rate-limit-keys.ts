import crypto from "crypto";

/**
 * FIX-D1 — ЕДИНСТВЕННЫЙ источник имён ключей OTP-лимитера.
 *
 * ## Почему модуль появился
 *
 * Имена ключей выводились в двух местах: в рантайме (`otp-rate-limit.ts`) и —
 * второй копией — в QA-харнессе (`.qa/otp.ts`, `clearOtpRateLimit`). Копия
 * протухла молча и дважды:
 *
 *   1. Она считала, что на localhost `extractClientIp` вернёт `null` и продукт
 *      захеширует строку `"unknown"`. Продукт возвращает `::1`, поэтому живой
 *      ключ — `sha256("::1")`, а харнесс удалял `sha256("unknown")`. IP-счётчик
 *      не снимался НИКОГДА (замер SMOKE-02 · Ф-2).
 *   2. SEC-26 добавил второе измерение (`otp:request:phone-ip:` /
 *      `…email-ip:`), и копия про него не узнала вовсе.
 *
 * 🔴 Цена — не «неудобство»: серия холодных логинов упирается в `429`, а по
 * симптому это **неотличимо от сломанного логина**, то есть инструмент проверки
 * продукта сам производит ложные отказы. Ровно тот класс, который FIX-C10
 * сформулировал так: про ключ отвечает рантайм, никогда второе чтение списка.
 *
 * ## Почему отдельный файл, а не экспорт из `otp-rate-limit.ts`
 *
 * Тот модуль тянет `@/lib/redis/connection`, у которого `import "server-only"`
 * (GUARDRAILS-01). Харнесс — обычный `tsx`-скрипт вне Next, и такой импорт в
 * нём падает. Поэтому вывод имён вынесен сюда: **ноль зависимостей кроме
 * `crypto`**, импортируется и рантаймом, и харнессом. Тот же приём, что у
 * `schedule/editor-shared.ts` (инв. #15).
 *
 * Добавляете измерение лимита — добавляйте ключ ЗДЕСЬ, и харнесс получит его
 * без правки.
 */

export function hashOtpKeyPart(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Скоуп «идентичность + IP». Пустой/отсутствующий IP схлопывается в `"unknown"`
 * — это поведение РАНТАЙМА, и оно обязано жить здесь, а не воспроизводиться
 * вызывающими: именно предположение о нём и протухло.
 */
export function otpScopeId(identity: string, ip: string | null | undefined): string {
  return `${hashOtpKeyPart(identity)}:${hashOtpKeyPart(ip?.trim() || "unknown")}`;
}

export type OtpKeyChannel = "phone" | "email";

/**
 * Нормализация идентичности перед хешированием — та же, что на боевом пути:
 * email приводится к нижнему регистру (`otp-rate-limit.ts` делает это до
 * построения ключа), телефон уже канонизирован вызывающим.
 */
export function normalizeOtpIdentity(channel: OtpKeyChannel, identity: string): string {
  return channel === "email" ? identity.toLowerCase() : identity;
}

/** Ключ общего IP-бюджета выпуска (5 / 60 с). Общий для обоих каналов. */
export function otpRequestIpKey(ip: string | null | undefined): string {
  return `otp:request:ip:${hashOtpKeyPart(ip?.trim() || "unknown")}`;
}

/** SEC-26: бюджет одного источника — (идентичность, IP), 3 / 5 мин. */
export function otpRequestIdentityIpKey(
  channel: OtpKeyChannel,
  identity: string,
  ip: string | null | undefined
): string {
  const value = normalizeOtpIdentity(channel, identity);
  return `otp:request:${channel}-ip:${otpScopeId(value, ip)}`;
}

/** SEC-26: потолок отправок на идентичность — 10 / 60 мин. */
export function otpRequestIdentityKey(channel: OtpKeyChannel, identity: string): string {
  const value = normalizeOtpIdentity(channel, identity);
  return `otp:request:${channel}:${hashOtpKeyPart(value)}`;
}

export function otpVerifyLockKey(
  channel: OtpKeyChannel,
  identity: string,
  ip: string | null | undefined
): string {
  const value = normalizeOtpIdentity(channel, identity);
  const prefix = channel === "email" ? "otp:verify:email:lock" : "otp:verify:lock";
  return `${prefix}:${otpScopeId(value, ip)}`;
}

export function otpVerifyFailKey(
  channel: OtpKeyChannel,
  identity: string,
  ip: string | null | undefined
): string {
  const value = normalizeOtpIdentity(channel, identity);
  const prefix = channel === "email" ? "otp:verify:email:fail" : "otp:verify:fail";
  return `${prefix}:${otpScopeId(value, ip)}`;
}

/**
 * ВСЕ ключи, которыми лимитер может держать эту (идентичность, IP).
 *
 * Потребитель — `clearOtpRateLimit` в харнессе: ему нужен именно полный набор,
 * и полнота обязана следовать из этого файла, а не из памяти автора спеки.
 */
export function allOtpRateLimitKeys(
  channel: OtpKeyChannel,
  identity: string,
  ip: string | null | undefined
): string[] {
  return [
    otpRequestIpKey(ip),
    otpRequestIdentityIpKey(channel, identity, ip),
    otpRequestIdentityKey(channel, identity),
    otpVerifyLockKey(channel, identity, ip),
    otpVerifyFailKey(channel, identity, ip),
  ];
}
