import { selectAccessToken } from "@/lib/auth/bearer";
import { verifyToken } from "@/lib/auth/jwt";
import { env } from "@/lib/env";
import { getClientIp } from "@/lib/http/ip";
import { routeRateLimitKey, type RateLimitKey } from "@/lib/rate-limit/keys";

/**
 * MOBILE-B1 — кем меряется бюджет пользовательских лимитов: вошедший —
 * по `userId`, аноним — по IP.
 *
 * Мобильные операторы держат абонентов за CGNAT: за одним адресом — сотни
 * телефонов, и ведро «на IP» делилось между всеми вошедшими пользователями
 * приложения в этой соте. Для вошедшего честная единица учёта — аккаунт.
 *
 * Личность берётся из access-токена (Bearer или кука — правило
 * `selectAccessToken`: заявлен Bearer — решает заголовок) ТОЛЬКО по подписи и
 * сроку, без похода в БД за семьёй сессий (SEC-13): лимитеру нужна не
 * авторизация, а честный счётчик. Отозванный, но не истёкший токен по-прежнему
 * упирается в бюджет СВОЕГО аккаунта — выпустить себе новое ведро без секрета
 * подписи нельзя, то есть ось «user» не даёт бесконечных вёдер.
 *
 * Обработчик проверяет токен заново, а не доверяет прокси через внутренний
 * заголовок: матчер прокси исключает пути с картиночным расширением, и на
 * таком пути подставленный клиентом заголовок дошёл бы до обработчика как есть
 * (а здесь он означал бы «своё ведро на каждый запрос»). HMAC подписи — микросекунды.
 */
export function accessTokenSubject(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const payload = verifyToken(token, "access");
    return typeof payload?.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    // Прокси не имеет права бросать (500 на каждый запрос): негодный токен — аноним.
    return null;
  }
}

/** Значение куки из заголовка `Cookie` (прокси читает так куку после ротации). */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim() || null;
  }
  return null;
}

/** `userId` действующего access-токена запроса; `null` — аноним или токен негоден. */
export function rateLimitUserIdFromRequest(req: Request): string | null {
  const cookieToken = readCookie(req.headers.get("cookie"), env.AUTH_COOKIE_NAME ?? "bh_session");
  return accessTokenSubject(selectAccessToken(req.headers.get("authorization"), cookieToken));
}

/**
 * Ключ лимитера роута для пользовательских чтений (лента, каталог, горячие
 * слоты): вошедший — ось `user`, аноним — ось `ip`. Для денежных и
 * анти-абьюзных лимитов (OTP, вход, платные API, гостевые записи) НЕ
 * применяется — у них своя, осознанно выбранная ось.
 */
export function viewerRateLimitKey(req: Request): RateLimitKey {
  const userId = rateLimitUserIdFromRequest(req);
  return userId ? routeRateLimitKey(req, "user", userId) : routeRateLimitKey(req, "ip", getClientIp(req));
}
