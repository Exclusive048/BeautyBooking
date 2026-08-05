import { randomBytes, randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";
import { exceedsDeclaredBodyLimit } from "@/lib/http/body-limit";
import { getClientIp } from "@/lib/http/ip";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { toApiRouteTemplate } from "@/lib/rate-limit/route-template";
import { verifyToken } from "@/lib/auth/jwt";

const PRODUCTION_ORIGIN = "https://мастеррядом.online";
const PRODUCTION_WWW_ORIGIN = "https://www.мастеррядом.online";
const ALLOWED_DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization, x-idempotency-key";

/**
 * Normalize an origin string into the canonical form `new URL` produces.
 *
 * Critical for МастерРядом's Cyrillic IDN domain: browsers serialize the
 * `Origin` header as Punycode (e.g. `https://xn--80aic0adlmagk0m.online`)
 * while the source code spells it in Cyrillic (`https://мастеррядом.online`).
 * `new URL().origin` normalizes both forms to the same Punycode canonical,
 * so allowlist comparison must run BOTH sides through this function.
 *
 * Closes two CORS bugs found by PRE-LAUNCH-QUICK-AUDITS-A (2026-05-31):
 *   1. www-subdomain comparison built `"www.${host}"` WITHOUT `https://`
 *      prefix → never matched browser's `Origin: https://www.…` header.
 *   2. Cyrillic IDN literal in allowlist never matched the Punycode form
 *      that browsers actually send.
 *
 * Returns null if the input is not parseable as a URL (defensive — same
 * caller-side handling: "treat as blocked").
 */
export function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

const PRODUCTION_ALLOWLIST_NORMALIZED = new Set(
  [PRODUCTION_ORIGIN, PRODUCTION_WWW_ORIGIN]
    .map(normalizeOrigin)
    .filter((value): value is string => value !== null),
);

const DEV_ALLOWLIST_NORMALIZED = new Set(
  [...ALLOWED_DEV_ORIGINS]
    .map(normalizeOrigin)
    .filter((value): value is string => value !== null),
);

/**
 * SEC-19 — dev-ветка была написана так:
 *
 *     if (ALLOWED_DEV_ORIGINS.has(requestOrigin)) return requestOrigin;
 *     return requestOrigin;
 *
 * то есть первая строка не значила ничего: отражался ЛЮБОЙ `Origin`, и рядом
 * `setCorsHeaders` ставит `Access-Control-Allow-Credentials: true`. Безопасно
 * это было ровно потому, что `Dockerfile` фиксирует `ENV NODE_ENV=production`,
 * — то есть защита держалась на переменной окружения сборки, а не на коде.
 * Любой запуск прод-нагрузки без `NODE_ENV=production` давал полный обход CORS
 * с куками и заодно снимал CSP (те же ветки ниже по файлу).
 *
 * Теперь ветка одна: аллоулист выбирается по окружению, а решение — общее.
 * `NEXT_PUBLIC_APP_URL` признаётся в обоих окружениях: в dev это escape hatch
 * для разработчика, открывающего приложение по LAN-адресу, и он же остаётся
 * явным списком, а не отражением чего угодно.
 */
export function getAllowedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;

  const incoming = normalizeOrigin(requestOrigin);
  if (!incoming) return null;

  const allowlist =
    process.env.NODE_ENV === "production"
      ? PRODUCTION_ALLOWLIST_NORMALIZED
      : DEV_ALLOWLIST_NORMALIZED;

  if (allowlist.has(incoming)) return requestOrigin;

  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) {
    const envNormalized = normalizeOrigin(envUrl);
    if (envNormalized && envNormalized === incoming) return requestOrigin;
  }

  return null;
}

function setCorsHeaders(response: NextResponse, origin: string): void {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
  response.headers.set("Access-Control-Allow-Headers", CORS_HEADERS);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Max-Age", "600");
}

type RateLimitTier =
  | "bookingCreate"
  | "reviewCreate"
  | "mediaUpload"
  | "modelOffer"
  | "modelApplication"
  | "cabinetMutation"
  | "webhookIngress"
  | "publicApi";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const REFRESH_ENDPOINT_PATH = "/api/auth/refresh";
/**
 * RES-04 — верхняя граница self-hop'а прокси в `/api/auth/refresh`.
 *
 * 2 с: обновление сессии — это одна проверка подписи + пара запросов к БД, то
 * есть десятки миллисекунд на здоровой системе. Порог выбран так, чтобы не
 * срезать легитимный хвост латентности и при этом не дать очереди сложиться:
 * при 2 с прокси освобождает слот раньше, чем клиентский `fetch` успевает
 * выйти по собственному таймауту.
 */
const REFRESH_FETCH_TIMEOUT_MS = 2000;
const PUBLIC_PATHS = ["/login", "/register", "/api/auth/otp", REFRESH_ENDPOINT_PATH, "/_next", "/favicon"];

function resolveRequestId(request: NextRequest): string {
  const header = request.headers.get("x-request-id");
  if (header && header.trim().length > 0) return header.trim();
  return randomUUID();
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set("x-request-id", requestId);
  return response;
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function resolveRateLimitTier(method: string, pathname: string): RateLimitTier | null {
  if (!pathname.startsWith("/api/")) return null;
  if (pathname === REFRESH_ENDPOINT_PATH) return null;

  if (method === "POST") {
    if (pathname === "/api/bookings") return "bookingCreate";
    if (pathname === "/api/reviews") return "reviewCreate";
    if (pathname === "/api/media") return "mediaUpload";
    if (pathname === "/api/model-offers") return "modelOffer";
    if (pathname === "/api/model-applications") return "modelApplication";
    // HARDENING-02: YooKassa webhook — generous, isolated tier so its (spaced)
    // retries never trip a shared public-API limit. Still sensitive/fail-closed
    // via the /api/payments prefix in rate-limit/index.ts.
    if (pathname === "/api/payments/yookassa/webhook") return "webhookIngress";
  }

  if (
    MUTATION_METHODS.has(method) &&
    (pathname.startsWith("/api/cabinet/") ||
      pathname.startsWith("/api/master/") ||
      pathname.startsWith("/api/studio/"))
  ) {
    return "cabinetMutation";
  }

  return "publicApi";
}

/**
 * SEC-08 — второй слой защиты от CSRF, рядом с `SameSite=Lax`.
 *
 * Куки уже стоят с явным `SameSite=Lax`, поэтому классический межсайтовый
 * CSRF на POST закрыт. Остаточная поверхность — **same-site, cross-origin**:
 * `SameSite` не различает поддомены, то есть любой поддомен
 * `мастеррядом.online` (будущий staging, маркетинговый, скомпрометированный)
 * делает полноценные аутентифицированные мутации. Второго слоя не было
 * вообще: ни один мутирующий обработчик не смотрел ни на `Origin`, ни на
 * `Sec-Fetch-Site`.
 *
 * Порядок сигналов важен и выбран под реальный состав трафика:
 *   1. `Sec-Fetch-Site` — его шлют все актуальные браузеры, и только он
 *      различает `same-site` (тот самый поддомен) и `same-origin`.
 *      `none` — это адресная строка/закладка, легитимно.
 *   2. `Origin` — запасной сигнал для старых браузеров.
 *   3. **Ни того, ни другого — пропускаем.** Это не дыра, а необходимость:
 *      так выглядит вебхук ЮКассы, cron-эндпоинты и будущий мобильный
 *      клиент. Браузер, выполняя межсайтовую мутацию, обязан прислать хотя
 *      бы один из двух заголовков — то есть класс атаки закрыт, а
 *      server-to-server не сломан.
 *
 * Встраивание в чужую страницу здесь ни при чём: CSP несёт
 * `frame-ancestors 'none'`, легитимных cross-site мутаций у продукта нет.
 */
const CSRF_TRUSTED_FETCH_SITES = new Set(["same-origin", "none"]);

export function shouldRejectCrossSiteMutation(input: {
  method: string;
  fetchSite: string | null;
  origin: string | null;
  originAllowed: boolean;
}): boolean {
  if (!MUTATION_METHODS.has(input.method)) return false;
  if (input.fetchSite) return !CSRF_TRUSTED_FETCH_SITES.has(input.fetchSite);
  if (!input.origin) return false;
  return !input.originAllowed;
}

function isAccessTokenValid(token: string | undefined): boolean {
  if (!token) return false;
  try {
    return Boolean(verifyToken(token, "access"));
  } catch {
    return false;
  }
}

function splitCombinedSetCookieHeader(headerValue: string): string[] {
  return headerValue
    .split(/,(?=\s*[^;,=\s]+=[^;,]*)/g)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function readSetCookieHeaders(headers: Headers): string[] {
  const headersWithGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headersWithGetSetCookie.getSetCookie === "function") {
    const values = headersWithGetSetCookie
      .getSetCookie()
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (values.length > 0) return values;
  }

  const combined = headers.get("set-cookie");
  if (!combined) return [];
  return splitCombinedSetCookieHeader(combined);
}

/**
 * LOGIC-22 — обновлённая сессия должна действовать в ЭТОМ запросе, а не в
 * следующем.
 *
 * Прокси при протухшем access-токене честно обновляет сессию server-to-server,
 * но свежие куки клал только в ОТВЕТ. `requestHeaders`, которые уезжают в
 * обработчик роута, оставались со старой `cookie`, поэтому обработчик видел
 * протухшую сессию и считал вызывающего анонимом. На `/api/bookings` это не
 * ошибка авторизации, а тихая смена ветки: зарегистрированный клиент уходил по
 * ГОСТЕВОМУ пути, где обязателен `consent` — а клиент его не слал, потому что
 * своим состоянием считал себя авторизованным. Итог — 400 `CONSENT_REQUIRED`
 * на самом ответственном шаге воронки, исчезающий со второй попытки (браузер
 * к тому моменту уже получил новую куку с ответом на упавший запрос).
 *
 * Слияние, а не замена: `Set-Cookie` приходит только на сессионную пару, а в
 * запросе живут и чужие куки (баннер cookie-уведомления, OAuth-state) —
 * затереть их значило бы сломать соседние механизмы. Удаление (`Max-Age=0`,
 * так `clearSessionCookies` гасит пару) обязано убирать имя из запроса, иначе
 * обработчик увидел бы отозванную сессию живой.
 */
export function mergeRefreshedCookies(
  currentCookieHeader: string | null,
  setCookieHeaders: string[],
): string {
  const jar = new Map<string, string>();
  for (const part of (currentCookieHeader ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    if (name) jar.set(name, part.slice(separator + 1).trim());
  }

  for (const setCookie of setCookieHeaders) {
    const [pair, ...attributes] = setCookie.split(";");
    const separator = pair?.indexOf("=") ?? -1;
    if (!pair || separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    if (!name) continue;

    const maxAge = attributes
      .map((attribute) => /^\s*max-age\s*=\s*(-?\d+)\s*$/i.exec(attribute))
      .find((match) => match !== null);
    if (maxAge && Number(maxAge[1]) <= 0) {
      jar.delete(name);
      continue;
    }

    jar.set(name, pair.slice(separator + 1).trim());
  }

  return Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
}

export async function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request);
  const method = request.method.toUpperCase();
  const pathname = normalizePathname(request.nextUrl.pathname);

  // CORS: handle preflight for API routes
  const isApiRoute = pathname.startsWith("/api/");
  const corsOrigin = isApiRoute ? getAllowedOrigin(request.headers.get("origin")) : null;

  if (isApiRoute && method === "OPTIONS") {
    const preflightResponse = new NextResponse(null, { status: 204 });
    if (corsOrigin) setCorsHeaders(preflightResponse, corsOrigin);
    preflightResponse.headers.set("x-request-id", requestId);
    return preflightResponse;
  }

  // SEC-08: отсекаем ДО обновления сессии — межсайтовая мутация не должна
  // даже провоцировать ротацию refresh-токена.
  if (
    isApiRoute &&
    shouldRejectCrossSiteMutation({
      method,
      fetchSite: request.headers.get("sec-fetch-site"),
      origin: request.headers.get("origin"),
      originAllowed: corsOrigin !== null,
    })
  ) {
    return withRequestId(
      NextResponse.json(
        { error: "Запрос отклонён: недопустимый источник." },
        { status: 403 },
      ),
      requestId,
    );
  }

  // SEC-16, слой 1: заявленный перебор отсекается до входа в обработчик и до
  // обновления сессии — как и межсайтовая мутация выше. Фактический счётчик
  // байтов (Content-Length может отсутствовать или лгать) — в `readBodyTextCapped`.
  if (
    isApiRoute &&
    exceedsDeclaredBodyLimit({
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
    })
  ) {
    return withRequestId(
      NextResponse.json(
        { error: "Слишком большой запрос." },
        { status: 413 },
      ),
      requestId,
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  let refreshedSetCookies: string[] = [];

  if (!isPublicPath) {
    const accessCookieName = process.env.AUTH_COOKIE_NAME ?? "bh_session";
    const accessToken = request.cookies.get(accessCookieName)?.value;
    const accessValid = isAccessTokenValid(accessToken);

    if (!accessValid) {
      const refreshToken = request.cookies.get("bh_refresh")?.value;
      if (refreshToken) {
        const refreshUrl = new URL(REFRESH_ENDPOINT_PATH, request.url);
        // RES-04: у этого хопа обязана быть верхняя граница, и она не про
        // «медленно». Прокси держит ВХОДЯЩИЙ запрос, пока ждёт ИСХОДЯЩИЙ к
        // самому себе, то есть каждый такой запрос занимает два слота
        // обработки вместо одного. Если `/api/auth/refresh` начинает тормозить
        // (исчерпан пул Prisma), петля затягивается сама: чем больше висит,
        // тем меньше слотов остаётся тому самому роуту, которого все ждут.
        // Без границы разорвать её нечем. Матчер покрывает всё, кроме статики,
        // а access-токен живёт 2 ч — путь горячий у каждого залогиненного.
        //
        // Отказ или таймаут = продолжаем БЕЗ обновления: обработчик увидит
        // протухшую куку и ответит 401, клиент уйдёт на /login. Это хуже
        // успешного обновления и лучше зависания. `fetch` здесь ещё и бросал
        // при сетевой ошибке (ECONNREFUSED при рестарте) — из middleware это
        // 500 на КАЖДЫЙ запрос, а не 401.
        try {
          const refreshRes = await fetch(refreshUrl.toString(), {
            method: "POST",
            headers: {
              cookie: request.headers.get("cookie") ?? "",
            },
            signal: AbortSignal.timeout(REFRESH_FETCH_TIMEOUT_MS),
          });

          if (refreshRes.ok) {
            refreshedSetCookies = readSetCookieHeaders(refreshRes.headers);
            // LOGIC-22: свежая кука уезжает и ВНУТРЬ — иначе обработчик этого же
            // запроса продолжит читать протухшую и примет вызывающего за гостя.
            if (refreshedSetCookies.length > 0) {
              requestHeaders.set(
                "cookie",
                mergeRefreshedCookies(request.headers.get("cookie"), refreshedSetCookies),
              );
            }
          }
        } catch {
          // Логгера здесь нет намеренно: `logging/logger.ts` тянет
          // `async_hooks`, которого нет в edge-рантайме прокси.
          refreshedSetCookies = [];
        }
      }
    }
  }

  const tier = resolveRateLimitTier(method, pathname);

  if (tier) {
    const ip = getClientIp(request);
    // SEC-03: ключ строится по ШАБЛОНУ роута, а не по конкретному URL. Иначе
    // каждый id — своё ведро, и перечисление по id не throttled вообще.
    const key = `rl:${tier}:${ip}:${method}:${toApiRouteTemplate(pathname)}`;
    const result = await checkRateLimit(key, RATE_LIMITS[tier]);

    if (result.limited) {
      return withRequestId(
        NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              "Retry-After": String(result.retryAfterSeconds),
            },
          },
        ),
        requestId
      );
    }
  }

  const nonce = randomBytes(16).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    // FIX-24 (Item 2a): the Telegram Login widget renders its button as an
    // <iframe> from oauth.telegram.org. default-src 'self' (the frame fallback)
    // blocked it → telegram login/connect dead in prod. Scoped to the exact
    // host only (keeps same-origin frames; no wildcard). VK uses a top-level
    // redirect (no frame), so it needs nothing here.
    "frame-src 'self' https://oauth.telegram.org",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https: wss:",
    ...(!isDev ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  requestHeaders.set("x-nonce", nonce);

  // В dev не устанавливаем CSP — нужен eval для Fast Refresh
  if (!isDev) {
    requestHeaders.set("content-security-policy", csp);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (!isDev) {
    response.headers.set("content-security-policy", csp);
  }
  for (const setCookie of refreshedSetCookies) {
    response.headers.append("set-cookie", setCookie);
  }

  if (corsOrigin) {
    setCorsHeaders(response, corsOrigin);
  }

  return withRequestId(response, requestId);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
