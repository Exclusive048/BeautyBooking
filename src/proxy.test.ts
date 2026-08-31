/**
 * CORS-FIXES-BATCH-A — regression tests for the two CORS bugs surfaced
 * by PRE-LAUNCH-QUICK-AUDITS-A (2026-05-31):
 *
 *   Bug 1 (CORS-WWW-FIX-A): `` `www.${PRODUCTION_ORIGIN.replace("https://", "")}` ``
 *   built `"www.мастеррядом.online"` WITHOUT `https://` prefix. Browser
 *   Origin headers always include protocol, so the comparison never
 *   matched → www subdomain users got CORS errors.
 *
 *   Bug 2 (CORS-IDN-FIX-A): Cyrillic IDN literal in the allowlist never
 *   matched the Punycode form (`xn--80aic0adlmagk0m.online`) that modern
 *   browsers send for IDN domains in `Origin` headers.
 *
 * Fix: introduced `normalizeOrigin()` helper using `new URL().origin` —
 * Node's URL parser converts Cyrillic IDN to Punycode automatically, so
 * both the allowlist and the incoming origin pass through normalization
 * and compare as their canonical Punycode form.
 *
 * Tests focus on the pure predicate (no NextRequest mock needed). Same
 * pattern as other proxy-adjacent pure-helper tests (e.g. `prompt-modal.test.tsx`).
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import {
  getAllowedOrigin,
  mergeRefreshedCookies,
  normalizeOrigin,
  shouldRejectCrossSiteMutation,
} from "./proxy";

// DOMAIN-CUTOVER-01 (2026-09-01): прод переехал на ASCII-домен masterryadom.ru,
// но IDN-поведение normalizeOrigin ОСТАЁТСЯ под пином — на нём держится отказ
// look-alike-IDN-ориджинов. Кириллические строки ниже — бывший домен, оставлен
// как реалистичный IDN-пример; принадлежность домена для функции не важна.
describe("normalizeOrigin — IDN + protocol canonicalization", () => {
  it("текущий ASCII-домен нормализация не меняет (тождество)", () => {
    expect(normalizeOrigin("https://masterryadom.ru")).toBe("https://masterryadom.ru");
    expect(normalizeOrigin("https://www.masterryadom.ru")).toBe("https://www.masterryadom.ru");
  });

  it("normalizes Cyrillic IDN to Punycode form", () => {
    expect(normalizeOrigin("https://мастеррядом.online")).toBe(
      "https://xn--80aic0adlmagk0m.online",
    );
  });

  it("preserves Punycode form unchanged (already canonical)", () => {
    expect(normalizeOrigin("https://xn--80aic0adlmagk0m.online")).toBe(
      "https://xn--80aic0adlmagk0m.online",
    );
  });

  it("normalizes Cyrillic + www subdomain to Punycode + www", () => {
    expect(normalizeOrigin("https://www.мастеррядом.online")).toBe(
      "https://www.xn--80aic0adlmagk0m.online",
    );
  });

  it("returns null for unparseable origin (defensive)", () => {
    expect(normalizeOrigin("not-a-url")).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
  });

  it("preserves protocol — http vs https produce distinct origins", () => {
    expect(normalizeOrigin("http://мастеррядом.online")).toBe(
      "http://xn--80aic0adlmagk0m.online",
    );
    expect(normalizeOrigin("https://мастеррядом.online")).toBe(
      "https://xn--80aic0adlmagk0m.online",
    );
  });

  it("preserves non-IDN origins unchanged", () => {
    expect(normalizeOrigin("https://example.com")).toBe("https://example.com");
    expect(normalizeOrigin("https://evil.example.com")).toBe(
      "https://evil.example.com",
    );
  });

  it("strips path / query / hash from the origin (security-critical — only scheme+host+port match)", () => {
    expect(normalizeOrigin("https://masterryadom.ru/admin?x=1#hash")).toBe(
      "https://masterryadom.ru",
    );
  });
});

describe("CORS allowlist via normalizeOrigin — both bugs regression-pinned", () => {
  // Mirror of PRODUCTION_ALLOWLIST_NORMALIZED inside proxy.ts. The Set
  // semantics + normalization are what the real getAllowedOrigin() does.
  // DOMAIN-CUTOVER-01: список — только masterryadom.ru; прежние .online-формы
  // обязаны отвергаться (см. негативные кейсы ниже).
  const PRODUCTION_ALLOWLIST = new Set(
    [
      "https://masterryadom.ru",
      "https://www.masterryadom.ru",
    ]
      .map(normalizeOrigin)
      .filter((value): value is string => value !== null),
  );

  function isAllowed(incoming: string): boolean {
    const normalized = normalizeOrigin(incoming);
    if (!normalized) return false;
    return PRODUCTION_ALLOWLIST.has(normalized);
  }

  // Bug 1 regression (www subdomain comparison missing protocol)
  it("allows browser-sent www form", () => {
    expect(isAllowed("https://www.masterryadom.ru")).toBe(true);
  });

  it("allows bare origin", () => {
    expect(isAllowed("https://masterryadom.ru")).toBe(true);
  });

  // DOMAIN-CUTOVER-01: прежний кириллический домен погашен — обе его формы
  // (unicode и punycode, bare и www) обязаны отвергаться. Это регрессия
  // против «забытая строка в allowlist оставила старый домен доверенным».
  it("rejects the retired Cyrillic domain in every form", () => {
    expect(isAllowed("https://мастеррядом.online")).toBe(false);
    expect(isAllowed("https://xn--80aic0adlmagk0m.online")).toBe(false);
    expect(isAllowed("https://www.мастеррядом.online")).toBe(false);
    expect(isAllowed("https://www.xn--80aic0adlmagk0m.online")).toBe(false);
  });

  // Negative cases — security-critical to confirm normalization didn't
  // accidentally widen the allowlist
  it("rejects unrelated origin", () => {
    expect(isAllowed("https://evil.example.com")).toBe(false);
  });

  it("rejects wrong protocol (http instead of https)", () => {
    expect(isAllowed("http://masterryadom.ru")).toBe(false);
  });

  it("rejects look-alike domain (subdomain hijack defense)", () => {
    // Trying to fake the host by registering masterryadom.ru.evil.com
    expect(isAllowed("https://masterryadom.ru.evil.com")).toBe(false);
  });

  it("rejects empty/malformed Origin", () => {
    expect(isAllowed("")).toBe(false);
    expect(isAllowed("not-a-url")).toBe(false);
  });

  it("rejects unauthorized subdomain (e.g. api.masterryadom.ru)", () => {
    // Only bare + www are allowed; arbitrary subdomains must NOT be admitted
    expect(isAllowed("https://api.masterryadom.ru")).toBe(false);
    expect(isAllowed("https://admin.masterryadom.ru")).toBe(false);
  });
});

/**
 * SEC-08 — второй слой против CSRF поверх `SameSite=Lax`.
 *
 * `SameSite=Lax` закрывает классический межсайтовый CSRF, но НЕ различает
 * поддомены: любой поддомен `masterryadom.ru` мог делать аутентифицированные
 * мутации. Ключевой кейс здесь — `sec-fetch-site: same-site`, а не `cross-site`.
 *
 * Второе обязательство теста — не сломать server-to-server: вебхук ЮКассы и
 * cron-эндпоинты не шлют ни `Origin`, ни `Sec-Fetch-Site`, и обязаны проходить.
 */
describe("shouldRejectCrossSiteMutation — SEC-08", () => {
  const base = { origin: null as string | null, originAllowed: false };

  it("поддомен (same-site) отклоняется — это и есть остаточная поверхность Lax", () => {
    expect(
      shouldRejectCrossSiteMutation({ ...base, method: "POST", fetchSite: "same-site" }),
    ).toBe(true);
  });

  it("чужой сайт (cross-site) отклоняется", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(
        shouldRejectCrossSiteMutation({ ...base, method, fetchSite: "cross-site" }),
      ).toBe(true);
    }
  });

  it("свой origin и адресная строка проходят", () => {
    expect(
      shouldRejectCrossSiteMutation({ ...base, method: "POST", fetchSite: "same-origin" }),
    ).toBe(false);
    expect(
      shouldRejectCrossSiteMutation({ ...base, method: "POST", fetchSite: "none" }),
    ).toBe(false);
  });

  it("чтение не трогаем — гейт только на мутациях", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(
        shouldRejectCrossSiteMutation({ ...base, method, fetchSite: "cross-site" }),
      ).toBe(false);
    }
  });

  it("server-to-server проходит: ни Origin, ни Sec-Fetch-Site (вебхук ЮКассы, cron)", () => {
    expect(
      shouldRejectCrossSiteMutation({ method: "POST", fetchSite: null, origin: null, originAllowed: false }),
    ).toBe(false);
  });

  it("запасной сигнал Origin работает, когда Sec-Fetch-Site нет (старый браузер)", () => {
    expect(
      shouldRejectCrossSiteMutation({
        method: "POST",
        fetchSite: null,
        origin: "https://evil.example",
        originAllowed: false,
      }),
    ).toBe(true);
    expect(
      shouldRejectCrossSiteMutation({
        method: "POST",
        fetchSite: null,
        origin: "https://masterryadom.ru",
        originAllowed: true,
      }),
    ).toBe(false);
  });

  it("Sec-Fetch-Site главнее Origin: поддомен не пролезает подделкой allowlist-origin", () => {
    expect(
      shouldRejectCrossSiteMutation({
        method: "POST",
        fetchSite: "same-site",
        origin: "https://masterryadom.ru",
        originAllowed: true,
      }),
    ).toBe(true);
  });
});

/**
 * SEC-19 — dev-ветка `getAllowedOrigin` была написана так:
 *
 *     if (ALLOWED_DEV_ORIGINS.has(requestOrigin)) return requestOrigin;
 *     return requestOrigin;
 *
 * то есть первая строка не значила ничего и отражался ЛЮБОЙ `Origin`, а рядом
 * ставится `Access-Control-Allow-Credentials: true`. Безопасно это было ровно
 * потому, что `Dockerfile` фиксирует `ENV NODE_ENV=production` — защита жила в
 * переменной окружения, а не в коде.
 *
 * `NODE_ENV` в vitest — `"test"`, то есть по умолчанию исполняется именно та
 * ветка, в которой была дыра.
 */
describe("getAllowedOrigin — SEC-19", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("в dev отражает только allowlist, а не любой Origin", () => {
    expect(getAllowedOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(getAllowedOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(getAllowedOrigin("https://evil.example")).toBeNull();
  });

  it("в dev нормализует обе стороны — хвостовой слэш не обходит список", () => {
    expect(getAllowedOrigin("http://localhost:3000/")).toBe("http://localhost:3000/");
    expect(getAllowedOrigin("http://localhost:3001")).toBeNull();
  });

  it("непарсящийся Origin отклоняется", () => {
    expect(getAllowedOrigin("не-url")).toBeNull();
    expect(getAllowedOrigin(null)).toBeNull();
  });

  it("`NEXT_PUBLIC_APP_URL` — явный escape hatch, а не отражение чего угодно", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://172.29.32.1:3000");
    expect(getAllowedOrigin("http://172.29.32.1:3000")).toBe("http://172.29.32.1:3000");
    expect(getAllowedOrigin("http://172.29.32.2:3000")).toBeNull();
  });

  it("в production допущен только канонический домен (bare + www)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getAllowedOrigin("https://masterryadom.ru")).toBe("https://masterryadom.ru");
    expect(getAllowedOrigin("https://www.masterryadom.ru")).toBe("https://www.masterryadom.ru");
    // DOMAIN-CUTOVER-01: погашенный кириллический домен не проходит ни в одной форме
    expect(getAllowedOrigin("https://мастеррядом.online")).toBeNull();
    expect(getAllowedOrigin("https://xn--80aic0adlmagk0m.online")).toBeNull();
    // dev-адреса в проде не проходят — списки не смешались
    expect(getAllowedOrigin("http://localhost:3000")).toBeNull();
  });
});

/**
 * LOGIC-22 — прокси обновляет сессию, и обновление действует В ЭТОМ запросе.
 *
 * Свежие куки клались только в ответ, а `requestHeaders` уезжали в обработчик
 * со старой `cookie`. На `/api/bookings` это не 401, а тихая смена ветки:
 * зарегистрированный клиент со «протухшей вкладкой» уходил по ГОСТЕВОМУ пути,
 * где обязателен `consent`, которого клиент не слал (своим состоянием он
 * считал себя авторизованным) → 400 `CONSENT_REQUIRED`, исчезающий со второй
 * попытки. Слияние здесь — предмет теста: сессионную пару надо заменить,
 * соседние куки сохранить, погашенную — убрать.
 */
describe("mergeRefreshedCookies — LOGIC-22", () => {
  const REFRESHED = [
    "bh_session=new.access.jwt; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200",
    "bh_refresh=new.refresh.jwt; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=2592000",
  ];

  it("подменяет протухшую сессионную пару свежей", () => {
    const merged = mergeRefreshedCookies(
      "bh_session=stale.access.jwt; bh_refresh=old.refresh.jwt",
      REFRESHED,
    );
    expect(merged).toContain("bh_session=new.access.jwt");
    expect(merged).toContain("bh_refresh=new.refresh.jwt");
    expect(merged).not.toContain("stale.access.jwt");
    expect(merged).not.toContain("old.refresh.jwt");
  });

  it("сохраняет чужие куки — Set-Cookie приходит только на сессионную пару", () => {
    const merged = mergeRefreshedCookies(
      "mr_cookie_notice=v1; bh_session=stale.access.jwt; theme=dark",
      REFRESHED,
    );
    expect(merged).toContain("mr_cookie_notice=v1");
    expect(merged).toContain("theme=dark");
  });

  it("не протаскивает атрибуты Set-Cookie в заголовок запроса", () => {
    const merged = mergeRefreshedCookies("bh_session=stale", REFRESHED);
    for (const attribute of ["Path=", "HttpOnly", "SameSite", "Max-Age"]) {
      expect(merged).not.toContain(attribute);
    }
  });

  it("Max-Age=0 убирает имя, а не записывает пустое значение", () => {
    // Так гасит пару `clearSessionCookies`: увидеть отозванную сессию живой
    // обработчик не должен.
    const merged = mergeRefreshedCookies("bh_session=stale; theme=dark", [
      "bh_session=; Path=/; HttpOnly; Max-Age=0",
    ]);
    expect(merged).not.toContain("bh_session");
    expect(merged).toBe("theme=dark");
  });

  it("работает без входящей cookie (первый запрос вкладки)", () => {
    expect(mergeRefreshedCookies(null, REFRESHED)).toBe(
      "bh_session=new.access.jwt; bh_refresh=new.refresh.jwt",
    );
  });

  it("режет пару по ПЕРВОМУ '=' — значение может его содержать", () => {
    const merged = mergeRefreshedCookies("a=1", ["token=abc=def==; Path=/"]);
    expect(merged).toBe("a=1; token=abc=def==");
  });

  it("игнорирует мусорные сегменты, не роняя остальной jar", () => {
    expect(mergeRefreshedCookies("a=1;; =nameless; b=2", ["; broken"])).toBe("a=1; b=2");
  });
});
