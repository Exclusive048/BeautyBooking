import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { toApiRouteTemplate } from "@/lib/rate-limit/route-template";

/**
 * 29.09 доработки · 15 (RATE-LIMIT-MECHANISM-CONSOLIDATION) — ключ лимита.
 *
 * Раньше ключ был свободной строкой (42 вызова, форматы `rate:x:…`,
 * `rl:/api/путь:ось:…`, `log-error:…`, `support:ip:…`), а решение «отказывать ли
 * при обрыве Redis» (инв. #6) принималось тремя способами: по префиксу ПУТИ,
 * вынутому из ключа, по префиксу самого КЛЮЧА и внутри OTP-модуля. Попадёт ли
 * новый ключ в fail-closed, решало то, вспомнил ли автор дописать префикс.
 *
 * Теперь ключ собирают только два конструктора ниже, и оба кладут ШАБЛОН ПУТИ
 * последним — единственный источник чувствительности (`isSensitiveRouteKey`).
 * Путь берётся из самого запроса, ошибиться в нём нельзя; сырая строка в
 * `checkRateLimit` не компилируется (бренд, GUARD-INTEGRITY правило 8).
 *
 * Личность (телефон, IP, id) в имени ключа — HMAC, а не как есть: у номера
 * телефона мало энтропии, простой sha256 перебирается за минуты, то есть ПДн
 * из имён ключей Redis уходят только с секретом (принцип SEC-04). Смена
 * `AUTH_JWT_SECRET` лишь начинает окна заново.
 */
declare const rateLimitKeyBrand: unique symbol;
export type RateLimitKey = string & { readonly [rateLimitKeyBrand]: "RateLimitKey" };

function hashIdentity(identity: string): string {
  return createHmac("sha256", env.AUTH_JWT_SECRET ?? "rate-limit")
    .update(`rate-limit:${identity}`)
    .digest("hex")
    .slice(0, 32);
}

/** Ключ тира прокси: `rl:<tier>:<ip>:<method>:<шаблон>` (формат SEC-03). */
export function proxyRateLimitKey(tier: string, ip: string, method: string, pathname: string): RateLimitKey {
  return `rl:${tier}:${ip}:${method}:${toApiRouteTemplate(pathname)}` as RateLimitKey;
}

/**
 * Ключ лимитера роута: `rl:route:<ось>:<hmac(личность)>:<шаблон>`. Ось — чем
 * меряется бюджет (`ip`, `user`, `phone`, `token`); шаблон — из `req.url`.
 */
export function routeRateLimitKey(req: Request, axis: string, identity: string): RateLimitKey {
  const template = toApiRouteTemplate(new URL(req.url).pathname);
  return `rl:route:${axis}:${hashIdentity(identity)}:${template}` as RateLimitKey;
}
