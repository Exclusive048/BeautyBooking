import { randomBytes, randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { isPublicReferenceApiPath, SESSION_REFRESHED_REQUEST_HEADER } from "@/lib/api/cache-headers";
import { rotateSessionWithTelemetry } from "@/lib/auth/session-refresh";
import { checkRateLimit } from "@/lib/rate-limit";
import { exceedsDeclaredBodyLimit } from "@/lib/http/body-limit";
import { getClientIp } from "@/lib/http/ip";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { proxyRateLimitKey, proxyUserRateLimitKey } from "@/lib/rate-limit/keys";
import { accessTokenSubject, readCookie } from "@/lib/rate-limit/subject";
import { isBearerAuthorization, parseBearerToken } from "@/lib/auth/bearer";
import { startApiMetricsFlusher } from "@/lib/monitoring/api-metrics";
import { installHttpApiMetricsHook } from "@/lib/monitoring/http-metrics-hook";

/**
 * ADMIN-HEALTH-01 — замер длительности `/api/*` и heartbeat процесса для
 * панели «Состояние системы» ставятся ОТСЮДА, а не из `instrumentation.ts`:
 * Next компилирует instrumentation отдельным entry, в котором не резолвятся
 * ни Node-builtins (`crypto` из логгера), ни `redis` (список
 * `serverExternalPackages` тот entry игнорирует — см. next.config.ts), и
 * импорт оттуда ронял КАЖДЫЙ роут 500-й (проверено живым dev: «Module not
 * found: Can't resolve 'crypto'»). Прокси же живёт в обычном Node-бандле,
 * грузится при первом запросе в ОБОИХ контейнерах (`web` и `api`) и уже
 * импортирует Redis-лимитер. Оба вызова идемпотентны; в тестах не ставятся,
 * чтобы таймер флашера не ходил в Redis из-под vitest (`process.env` здесь
 * намеренно: тесты прокси мокают `@/lib/env` частично, а этот файл — в
 * списке исключений rule 11).
 */
if (process.env.NODE_ENV !== "test") {
  installHttpApiMetricsHook();
  startApiMetricsFlusher();
}

/**
 * Прод-ориджины для CORS и CSRF-слоя (SEC-08).
 *
 * Смена домена завершена (2026-09-01, DOMAIN-CUTOVER-01): прод — только
 * `masterryadom.ru`. `.online`-формы прежнего кириллического домена вычищены
 * по команде владельца, в локстепе с `CANONICAL_PUBLIC_HOSTS`
 * (`src/lib/env.ts`) — вкладки старого хоста теперь получают отказ на
 * мутациях, это ожидаемо.
 */
const PRODUCTION_ORIGINS = [
  "https://masterryadom.ru",
  "https://www.masterryadom.ru",
];
const ALLOWED_DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization, x-idempotency-key";

/**
 * Normalize an origin string into the canonical form `new URL` produces.
 *
 * Написана в эпоху кириллического IDN-домена (`мастеррядом.online`): браузеры
 * шлют `Origin` в punycode, а исходники писали кириллицу — сравнивать можно
 * было только после `new URL().origin` с ОБЕИХ сторон. Текущий домен
 * `masterryadom.ru` — латиница, нормализация для него тождественна, но
 * функция ОСТАЁТСЯ обязательной: она отрезает path/query/hash из сравнения и
 * канонизирует порт/регистр, а look-alike-IDN во входящем `Origin` продолжает
 * нормализоваться и честно НЕ совпадать с allowlist'ом.
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
  PRODUCTION_ORIGINS
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
  | "mobileAuth"
  | "mobileAuthRefresh"
  | "mediaRead"
  | "publicApi";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const REFRESH_ENDPOINT_PATH = "/api/auth/refresh";
/** MOBILE-AUTH-A — входы нативного приложения (токены в теле, без кук). */
const MOBILE_AUTH_PATH_PREFIX = "/api/mobile/v1/auth";
const MOBILE_REFRESH_ENDPOINT_PATH = `${MOBILE_AUTH_PATH_PREFIX}/refresh`;
/** MOBILE-B1 — байты медиа (оригинал, `?w=`-превью, вырез `crop/{v}`). */
const MEDIA_FILE_PATH_PREFIX = "/api/media/file/";
/** FIX-C2 — две неаутентифицированные health-пробы (см. `resolveRateLimitTier`). */
const HEALTH_LIVENESS_PATH = "/api/health";
const HEALTH_READINESS_PATH = "/api/health/ready";
/**
 * RES-04 задавал верхнюю границу self-hop'а прокси в `/api/auth/refresh` (2 с).
 * PERF-14 убрал сам хоп — обновление идёт вызовом функции, — поэтому и граница
 * ушла: ограничивать больше нечего, а гонка вокруг ротации токена вредна
 * (см. комментарий на месте вызова). Константа удалена намеренно, не забыта.
 */
/**
 * Пути, где прокси НЕ обновляет сессию.
 *
 * SESSION-LOSS-01 (2026-09-23): `/login` отсюда убран. Пользователь с живой
 * refresh-кукой и протухшим access-токеном, попавший на `/login` (закладка,
 * переход после временного сбоя), видел форму входа: страница умеет отправить
 * вошедшего в кабинет, но без обновления сессии она его не узнавала. Теперь
 * сессия обновляется и там, и страница уводит по `next`. Отсутствующий
 * `/register` убран вместе с ним.
 *
 * MOBILE-AUTH-A: `/api/mobile/v1/auth/*` — тот же класс, что `/api/auth/otp`:
 * сессию эти роуты выдают/ротируют/гасят сами по телу запроса, кука-хоп
 * прокси им не нужен (и приклеил бы `Set-Cookie` к ответу с токенами).
 *
 * MOBILE-POLISH: `/.well-known` — файлы App Links / Universal Links
 * (`lib/mobile/app-links.ts`). Ответ публичный и кэшируется на час: кука-хоп
 * приклеил бы к нему чужую сессию. Лимита и CSRF у пути и так нет (не `/api`).
 */
const PUBLIC_PATHS = [
  "/api/auth/otp",
  REFRESH_ENDPOINT_PATH,
  MOBILE_AUTH_PATH_PREFIX,
  "/_next",
  "/favicon",
  "/.well-known",
];

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
  // FIX-C2: неаутентифицированные health-пробы не проходят через лимитер, и это
  // не про их стоимость, а про независимость. Ключ лимита считается в Redis, то
  // есть ДО обработчика каждая проба платила ~2.5 с при обрыве Redis (замер
  // `SMOKE-01 · F5`) — проба, которая ждёт лежащую зависимость, чтобы сообщить,
  // что зависимость лежит, отчасти воспроизводит F2 уровнем выше.
  //
  // Изъятие узкое и перечислено поимённо: `/api/health/status` и
  // `/api/health/worker` гейтятся секретом, и снятие лимита открыло бы их
  // перебору. Обе строки ниже отдают ответ, не зависящий от вызывающего, и
  // работы не покупают: liveness не ходит никуда, readiness делает два
  // ограниченных сверху запроса по уже открытым соединениям.
  if (pathname === HEALTH_LIVENESS_PATH || pathname === HEALTH_READINESS_PATH) return null;

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
    // MOBILE-AUTH-A: веб-refresh из лимита изъят (строка выше — его зовёт сам
    // прокси), мобильный — нет: это публичная транзакция в БД на любой
    // присланный токен. Оба тира fail-closed через префикс в rate-limit/index.ts.
    if (pathname === MOBILE_REFRESH_ENDPOINT_PATH) return "mobileAuthRefresh";
    if (pathname.startsWith(`${MOBILE_AUTH_PATH_PREFIX}/`)) return "mobileAuth";
  }

  if (
    MUTATION_METHODS.has(method) &&
    (pathname.startsWith("/api/cabinet/") ||
      pathname.startsWith("/api/master/") ||
      pathname.startsWith("/api/studio/"))
  ) {
    return "cabinetMutation";
  }

  // MOBILE-B1: картинки — своё ведро, а не общий `publicApi`. Экран ленты
  // приложения — это десятки плиток (`?w=`-превью), и 120/мин на ленту из
  // одних картинок тесно уже одному человеку, а за CGNAT — тем более. Дёшево по
  // построению: байты неизменны (`immutable`, клиент не перезапрашивает), а
  // генерация превью ограничена набором ширин — не больше шести на актив.
  if (method === "GET" && pathname.startsWith(MEDIA_FILE_PATH_PREFIX)) return "mediaRead";

  return "publicApi";
}

/**
 * MOBILE-B1 — ось ключа тира: вошедший пользователь — по `userId`, аноним —
 * по IP (`lib/rate-limit/subject.ts`, там же — почему: CGNAT мобильных
 * операторов).
 *
 * По аккаунту меряются ПОЛЬЗОВАТЕЛЬСКИЕ тиры: действия продукта, где единица
 * злоупотребления — аккаунт, а аккаунт дорог (вход по OTP). По IP — всегда:
 *  · `webhookIngress` — сервер ЮKassa, сессии у него нет;
 *  · `mobileAuth` / `mobileAuthRefresh` и ЛЮБОЙ путь под `/api/auth` или
 *    `/api/mobile/v1/auth` (на этих путях тир чаще всего `publicApi`): вход,
 *    запрос и проверка OTP, refresh. Здесь вызывающий доказывает личность, а
 *    не пользуется ею: ключ по аккаунту позволил бы перебирать код из-под N
 *    своих сессий с N вёдрами. Собственные лимитеры OTP (телефон/почта + IP)
 *    не меняются.
 * Лимитеры уровня роута свою ось выбирают сами (`routeRateLimitKey`), этот
 * список их не касается.
 */
const USER_KEYED_TIERS: ReadonlySet<RateLimitTier> = new Set<RateLimitTier>([
  "bookingCreate",
  "reviewCreate",
  "mediaUpload",
  "modelOffer",
  "modelApplication",
  "cabinetMutation",
  "mediaRead",
  "publicApi",
]);
const AUTH_SURFACE_PREFIXES = ["/api/auth", MOBILE_AUTH_PATH_PREFIX];

export function rateLimitAxisFor(tier: RateLimitTier, pathname: string): "user" | "ip" {
  if (!USER_KEYED_TIERS.has(tier)) return "ip";
  const isAuthSurface = AUTH_SURFACE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return isAuthSurface ? "ip" : "user";
}

/**
 * SEC-08 — второй слой защиты от CSRF, рядом с `SameSite=Lax`.
 *
 * Куки уже стоят с явным `SameSite=Lax`, поэтому классический межсайтовый
 * CSRF на POST закрыт. Остаточная поверхность — **same-site, cross-origin**:
 * `SameSite` не различает поддомены, то есть любой поддомен
 * `masterryadom.ru` (будущий staging, маркетинговый, скомпрометированный)
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
 *
 * 🔴 Запрос несёт куки, видимые ЭТОМУ пути, а `Set-Cookie` с чужим `Path`
 * описывает ДРУГУЮ куку с тем же именем (браузер хранит пару «имя + путь»).
 * С SESSION-REFRESH-PATH-01 каждая выдача `bh_refresh` (`Path=/`) идёт вместе с
 * гашением прежней (`Path=/api/auth/refresh; Max-Age=0`) — и слияние по одному
 * имени удаляло из запроса только что выданный токен: обработчик `/logout`
 * получал `NO_TOKEN` и не отзывал ничего. Поэтому здесь учитываются только
 * куки корня (`Path=/` либо без пути — так пишет вся сессионная пара).
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

    const path = attributes
      .map((attribute) => /^\s*path\s*=\s*(\S*)\s*$/i.exec(attribute))
      .find((match) => match !== null);
    if (path && path[1] !== "/") continue;

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
  // Сигнал «в ответ уйдёт обновлённая кука» ставит только прокси (ниже).
  requestHeaders.delete(SESSION_REFRESHED_REQUEST_HEADER);
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  // PERF-13: на публичных справочниках refresh-хоп не делается вовсе. Иначе к
  // ответу, который сам объявил себя `public, s-maxage=…`, прикладывался бы
  // `Set-Cookie` с сессией — а такой ответ в разделяемом кэше отдаёт чужую сессию
  // следующему посетителю. Понизить директиву из прокси нельзя: заголовок
  // обработчика выигрывает у заголовка middleware (проверено рантаймом), поэтому
  // множества разводятся здесь. Ни один из этих роутов сессию не читает, а
  // обновление произойдёт на следующем же запросе к любому другому пути.
  // MOBILE-AUTH-A: запрос с `Authorization: Bearer` решается заголовком
  // (`selectAccessToken` в `auth/bearer.ts` — заголовок главнее куки), поэтому
  // кука-хоп ему бесполезен: ротировать куки, которые обработчик не прочтёт,
  // значит тратить одноразовый refresh-токен впустую. Нативное приложение кук
  // и не шлёт — проверка страхует смешанный случай.
  const authorization = request.headers.get("authorization");
  const bearerDeclared = isBearerAuthorization(authorization);
  const skipSessionRefresh =
    isPublicPath ||
    isPublicReferenceApiPath(pathname) ||
    bearerDeclared;
  let refreshedSetCookies: string[] = [];

  // MOBILE-B1: владелец access-куки нужен дважды — решить, обновлять ли сессию,
  // и выбрать ось лимита. Подпись проверяется один раз и запоминается
  // (`undefined` — ещё не проверяли).
  const accessCookieName = process.env.AUTH_COOKIE_NAME ?? "bh_session";
  let cookieSubject: string | null | undefined;
  const readCookieSubject = (): string | null => {
    if (cookieSubject === undefined) {
      cookieSubject = accessTokenSubject(request.cookies.get(accessCookieName)?.value);
    }
    return cookieSubject;
  };

  if (!skipSessionRefresh) {
    const accessValid = readCookieSubject() !== null;

    if (!accessValid) {
      const refreshToken = request.cookies.get("bh_refresh")?.value;
      if (refreshToken) {
        // PERF-14: обновление сессии идёт ВЫЗОВОМ ФУНКЦИИ, а не HTTP-запросом к
        // самому себе. Прежний self-hop держал ВХОДЯЩИЙ запрос, пока ждал
        // ИСХОДЯЩИЙ, то есть каждый такой запрос занимал два слота обработки
        // вместо одного, и при замедлении `/api/auth/refresh` (исчерпан пул
        // Prisma) петля затягивалась сама: чем больше висит, тем меньше слотов
        // остаётся тому самому роуту, которого все ждут. Путь горячий у каждого
        // залогиненного — матчер покрывает всё кроме статики, access-токен живёт
        // 2 ч. RES-04 ограничивал этот хоп сверху; теперь ограничивать нечего.
        //
        // Стало возможным потому, что прокси Next 16 работает в рантайме
        // **Node.js** (это дефолт, и опция `runtime` в proxy-файлах вообще
        // недоступна). Предыдущая формулировка про edge-рантайм здесь была
        // унаследована от эпохи `middleware.ts` и уже не соответствовала коду:
        // модуль и так импортирует `crypto` и Redis-лимитер.
        //
        // Таймаута тут намеренно НЕТ, и это не упущение: оборвать ротацию гонкой
        // нельзя. `Promise.race` не отменяет запрос Prisma — refresh-токен успел
        // бы пометиться использованным, а новая кука до клиента не доехала бы,
        // то есть пользователя выбросило бы на /login по вине самой защиты.
        // Верхняя граница есть и она серверная: `statement_timeout=30000`
        // (RES-24) плюс конечные `connect_timeout`/`pool_timeout` Prisma.
        //
        // Отказ = продолжаем БЕЗ обновления: обработчик увидит протухшую куку и
        // ответит 401, клиент уйдёт на /login. Хуже успешного обновления и лучше
        // упавшего запроса — throw из прокси это 500 на КАЖДЫЙ запрос.
        try {
          const carrier = NextResponse.next();
          const rotated = await rotateSessionWithTelemetry(carrier, refreshToken);

          if (rotated) {
            refreshedSetCookies = readSetCookieHeaders(carrier.headers);
            // LOGIC-22: свежая кука уезжает и ВНУТРЬ — иначе обработчик этого же
            // запроса продолжит читать протухшую и примет вызывающего за гостя.
            if (refreshedSetCookies.length > 0) {
              const mergedCookies = mergeRefreshedCookies(request.headers.get("cookie"), refreshedSetCookies);
              requestHeaders.set("cookie", mergedCookies);
              // MOBILE-B1: лимит этого запроса — уже по владельцу свежей сессии.
              cookieSubject = accessTokenSubject(readCookie(mergedCookies, accessCookieName));
              // PUBLIC-CACHE-SET-COOKIE: обработчик `public`-ответа обязан
              // знать, что к его ответу приложится сессия (`sharedCacheControlFor`).
              requestHeaders.set(SESSION_REFRESHED_REQUEST_HEADER, "1");
            }
          }
        } catch {
          // Логгера здесь нет намеренно: `logging/logger.ts` работает через
          // request-контекст, которого у прокси нет; отказ ротации уже виден в
          // телеметрии `surface: "auth"`.
          refreshedSetCookies = [];
        }
      }
    }
  }

  const tier = resolveRateLimitTier(method, pathname);

  if (tier) {
    // MOBILE-B1: вошедший — ведро аккаунта, аноним и auth-поверхность — ведро
    // IP (`rateLimitAxisFor`). Заявлен Bearer — решает заголовок, кука не
    // читается (то же правило, что у сессии, `auth/bearer.ts`).
    const userId =
      rateLimitAxisFor(tier, pathname) === "user"
        ? bearerDeclared
          ? accessTokenSubject(parseBearerToken(authorization))
          : readCookieSubject()
        : null;
    // SEC-03: ключ строится по ШАБЛОНУ роута, а не по конкретному URL. Иначе
    // каждый id — своё ведро, и перечисление по id не throttled вообще.
    const key = userId
      ? proxyUserRateLimitKey(tier, userId, method, pathname)
      : proxyRateLimitKey(tier, getClientIp(request), method, pathname);
    const result = await checkRateLimit(key, RATE_LIMITS[tier]);

    if (result.limited) {
      // FIX-B12: отказ по исчерпанному бюджету и отказ «не смогли посчитать»
      // рендерились одинаково — 429 «Too many requests». Для fail-closed
      // чувствительного роута при обрыве Redis это неверно дважды: статус учит
      // клиента реже повторять (а повторить как раз нужно), и текст утверждает
      // про число запросов то, чего не было. Форма конверта — та же, что у
      // `fail()` / `tooManyRequests()`, чтобы клиент разбирал ответ прокси и
      // ответ обработчика одинаково; собрана здесь руками, потому что
      // `getRequestId()` работает через request-контекст, которого у прокси нет.
      const unavailable = result.reason === "unavailable";
      const limitedResponse = withRequestId(
        NextResponse.json(
          {
            ok: false,
            requestId,
            error: unavailable
              ? {
                  message: "Сервис временно недоступен. Попробуйте позже.",
                  code: "RATE_LIMIT_UNAVAILABLE",
                  details: { retryAfterSeconds: result.retryAfterSeconds },
                }
              : {
                  message: "Слишком много запросов. Попробуйте позже.",
                  code: "RATE_LIMITED",
                  details: { retryAfterSeconds: result.retryAfterSeconds },
                },
          },
          {
            status: unavailable ? 503 : 429,
            headers: {
              "Retry-After": String(result.retryAfterSeconds),
            },
          },
        ),
        requestId
      );
      // SESSION-LOSS-01: если этот же запрос уже ротировал сессию, новая
      // кука обязана доехать и с отказом — иначе браузер останется с
      // использованным refresh-токеном.
      for (const setCookie of refreshedSetCookies) {
        limitedResponse.headers.append("set-cookie", setCookie);
      }
      return limitedResponse;
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
    // PWA-FIX-02: Яндекс-карта в кабинете мастера (блок «Локация») —
    // `<iframe src="https://yandex.ru/map-widget/v1/…">` (map-display.tsx).
    // Под прежним списком браузер её блокировал: пользователь видел серый
    // прямоугольник с «контент заблокирован» и решал, что не сохранился адрес,
    // хотя координаты в БД лежали (замер 2026-09-01: geoLat/geoLng заполнены,
    // карта пуста). Поддомен добавлен потому, что виджет вправе увести на
    // `maps.yandex.ru`; JS-API каталога (`api-maps.yandex.ru`) сюда не
    // относится — он идёт под `script-src`, где `https:` уже разрешён.
    "frame-src 'self' https://oauth.telegram.org https://yandex.ru https://*.yandex.ru",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    // PWA-UX-BATCH-01: без явного `worker-src` создание воркеров падает в
    // `script-src`, где `'strict-dynamic'` ОТКЛЮЧАЕТ host-based allowlisting
    // (включая `'self'`), а nonce к URL воркера неприменим — Chromium отказывал
    // бы в регистрации сервис-воркера (`/sw.js`) в проде: «Refused to create a
    // worker … Note that 'strict-dynamic' is present». CSP стоит только в
    // production, поэтому локально это не воспроизводилось; без SW нет ни
    // push-подписки, ни offline-fallback.
    "worker-src 'self'",
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
