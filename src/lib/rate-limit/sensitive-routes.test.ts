import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isSensitiveRouteKey, isSensitiveRouteTemplate } from "@/lib/rate-limit/index";
import { proxyRateLimitKey, routeRateLimitKey } from "@/lib/rate-limit/keys";
import { toApiRouteTemplate } from "@/lib/rate-limit/route-template";

/**
 * LOGIC-14 — весь платёжный домен, кроме вебхука, проваливался в тир
 * `publicApi` и не был fail-closed (инв. #6): при недоступности Redis
 * инициация платежа деградировала до per-process memory-fallback в проде и до
 * полного fail-open в dev, тогда как вебхук (`/api/payments`) fail-closed был.
 *
 * Обратная половина не менее важна: два прогона по расписанию лежат под тем же
 * префиксом, и fail-closed для них означает противоположное задуманному —
 * LOGIC-07 специально сделал лок продлений fail-open, а MRR-снапшот за
 * пропущенный день не бэкфиллится. Изъятия проверяются здесь же, иначе
 * следующий, кто «упростит» список префиксов, отменит оба решения молча.
 *
 * Ключи строятся так же, как их строит прокси (SEC-03):
 * `rl:<tier>:<ip>:<method>:<template>`.
 */

function proxyKey(method: string, pathname: string): string {
  return `rl:publicApi:203.0.113.7:${method}:${toApiRouteTemplate(pathname)}`;
}

describe("isSensitiveRouteKey — LOGIC-14", () => {
  it("денежные мутации биллинга fail-closed", () => {
    expect(isSensitiveRouteKey(proxyKey("POST", "/api/billing/checkout"))).toBe(true);
    expect(isSensitiveRouteKey(proxyKey("POST", "/api/billing/cancel"))).toBe(true);
    expect(isSensitiveRouteKey(proxyKey("PATCH", "/api/billing/auto-renew"))).toBe(true);
  });

  it("прогоны по расписанию — изъяты явно, а не забыты", () => {
    expect(isSensitiveRouteKey(proxyKey("POST", "/api/billing/renew/run"))).toBe(false);
    expect(isSensitiveRouteKey(proxyKey("POST", "/api/billing/mrr/snapshot/run"))).toBe(false);
  });

  it("вебхук платежей остаётся fail-closed (асимметрии внутри домена больше нет)", () => {
    expect(isSensitiveRouteKey(proxyKey("POST", "/api/payments/yookassa/webhook"))).toBe(true);
  });

  it("обычный публичный роут по-прежнему не чувствителен", () => {
    expect(isSensitiveRouteKey(proxyKey("GET", "/api/catalog/global-categories"))).toBe(false);
  });

  // MOBILE-POLISH (App Store 1.2): жалобы и блокировка — записи, которые нельзя
  // молча пропускать в память при обрыве Redis (флуд очереди модерации).
  it("жалобы, решения по ним и блокировка в переписке fail-closed", () => {
    expect(isSensitiveRouteKey(proxyKey("POST", "/api/reports"))).toBe(true);
    expect(isSensitiveRouteKey(proxyKey("POST", "/api/admin/reports/ck1/resolve"))).toBe(true);
    expect(isSensitiveRouteKey(proxyKey("POST", "/api/admin/reports/ck1/dismiss"))).toBe(true);
    expect(isSensitiveRouteKey(proxyKey("POST", "/api/chat/threads/aB3dE5gH7j/block"))).toBe(true);
    expect(isSensitiveRouteKey(proxyKey("DELETE", "/api/me/blocks/ck1"))).toBe(true);
  });
});

/**
 * 29.09 доработки · 15 (RATE-LIMIT-MECHANISM-CONSOLIDATION) — сверка «до/после».
 * Прежние 16 пространств ключей роутов были чувствительными по ПРЕФИКСУ КЛЮЧА
 * (`SENSITIVE_KEY_PREFIXES`, удалён). Ключ любого лимитера теперь строит только
 * конструктор `routeRateLimitKey(req, …)` (бренд — сырая строка не
 * компилируется), и шаблон пути в нём — из самого запроса. Поэтому ключ,
 * построенный здесь для URL этого роута, — ровно тот, что роут построит в
 * рантайме; для каждого прежнего пространства он обязан остаться чувствительным.
 *
 * @probe 2026-09-29 — (1) из `SENSITIVE_ROUTE_TEMPLATES` убран
 *        `/api/public/bookings`: красный «прежнее пространство … стало fail-open»
 *        с `rate:publicBooking:` и `rate:createBooking:` (гостевой путь).
 *        (2) точный шаблон заменён префиксом (`/api/public/bookings` в
 *        `SENSITIVE_ROUTE_PREFIXES`): красный «GET /api/public/bookings/:id
 *        остаётся fail-open». Возвращено — зелёный.
 */
const FORMER_KEY_NAMESPACES: Array<{ namespace: string; method: string; url: string }> = [
  { namespace: "rate:createBooking:", method: "POST", url: "/api/bookings" },
  { namespace: "rate:createBooking: (гостевой путь)", method: "POST", url: "/api/public/bookings" },
  { namespace: "rate:publicBooking:", method: "POST", url: "/api/public/bookings" },
  { namespace: "rate:packageBook:", method: "POST", url: "/api/public/packages/pkg-1/book" },
  { namespace: "rate:studioPackageBook:", method: "POST", url: "/api/public/packages/pkg-1/studio/book" },
  { namespace: "rate:guestManage: (отмена)", method: "POST", url: "/api/public/bookings/manage/tok-1/cancel" },
  { namespace: "rate:guestManage: (перенос)", method: "POST", url: "/api/public/bookings/manage/tok-1/reschedule" },
  { namespace: "rate:guestManage: (отзыв)", method: "POST", url: "/api/public/bookings/manage/tok-1/review" },
  { namespace: "rate:chatSend:", method: "POST", url: "/api/chat/threads/slug-1/messages" },
  { namespace: "rate:telegramWebhook:", method: "POST", url: "/api/telegram/webhook" },
  { namespace: "rl:categories:propose:", method: "POST", url: "/api/categories/propose" },
  { namespace: "rl:/api/me/delete", method: "DELETE", url: "/api/me/delete" },
  { namespace: "rl:/api/cabinet/master/delete", method: "DELETE", url: "/api/cabinet/master/delete" },
  { namespace: "rl:/api/cabinet/studio/delete", method: "DELETE", url: "/api/cabinet/studio/delete" },
  { namespace: "rl:/api/bookings", method: "POST", url: "/api/bookings/upload-reference" },
  { namespace: "rl:/api/master/portfolio", method: "POST", url: "/api/master/portfolio" },
  { namespace: "rl:/api/studio", method: "POST", url: "/api/studio/bookings" },
  { namespace: "rl:/api/studios", method: "PATCH", url: "/api/studios/st-1" },
  { namespace: "rl:/api/reviews", method: "POST", url: "/api/reviews/rev-1/suggest-reply" },
];

describe("29.09 · 15 · прежние пространства ключей остаются чувствительными", () => {
  for (const item of FORMER_KEY_NAMESPACES) {
    it(`${item.namespace} → ${item.url}`, () => {
      const req = new Request(`http://x${item.url}`, { method: item.method });
      const key = routeRateLimitKey(req, "ip", "203.0.113.7");
      expect(isSensitiveRouteKey(key), `прежнее пространство ${item.namespace} стало fail-open: ${key}`).toBe(true);
      // и прокси тем же шаблоном (п. 4 спеки: отказ на хоп раньше, тем же 503)
      expect(isSensitiveRouteKey(proxyRateLimitKey("publicApi", "203.0.113.7", item.method, item.url))).toBe(true);
    });
  }

  it("GET /api/public/bookings/:id и оба propose остаются fail-open (точный шаблон, не префикс)", () => {
    for (const url of [
      "/api/public/bookings/bk-1",
      "/api/public/packages/pkg-1/propose",
      "/api/public/packages/pkg-1/studio/propose",
      "/api/telegram/status",
    ]) {
      expect(isSensitiveRouteKey(routeRateLimitKey(new Request(`http://x${url}`), "ip", "1")), url).toBe(false);
    }
  });

  it("личность в ключе не хранится как есть (ПДн — не в именах ключей)", () => {
    const key = routeRateLimitKey(new Request("http://x/api/public/bookings", { method: "POST" }), "phone", "+79991234567");
    expect(key).not.toContain("79991234567");
    expect(key.endsWith(":/api/public/bookings")).toBe(true);
  });
});

/**
 * Третий механизм — OTP-модуль (`auth/otp-rate-limit.ts`) — остаётся со своими
 * командами (RES-11). Согласие политик: роуты, импортирующие его, обязаны быть
 * чувствительными и по пути — иначе тир прокси перед ними был бы fail-open, а
 * модуль — fail-closed, две политики на одном пути. Набор выводится из дерева.
 */
describe("29.09 · 15 · OTP-модуль и путь согласны", () => {
  const API_ROOT = path.resolve(process.cwd(), "src", "app", "api");
  function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, acc);
      else if (entry === "route.ts") acc.push(full);
    }
    return acc;
  }
  const otpRoutes = walk(API_ROOT)
    .filter((file) => /otp-rate-limit/.test(readFileSync(file, "utf8")))
    .map((file) => "/api/" + path.relative(API_ROOT, path.dirname(file)).split(path.sep).join("/"));

  it("обход находит OTP-роуты (иначе проверка вакуумна)", () => {
    expect(otpRoutes.length).toBeGreaterThanOrEqual(4);
  });

  it("каждый роут OTP-модуля чувствителен по шаблону пути", () => {
    const failOpen = otpRoutes.filter((route) => !isSensitiveRouteTemplate(toApiRouteTemplate(route)));
    expect(failOpen, `OTP-роут вне чувствительных путей: ${failOpen.join(", ")}`).toEqual([]);
  });
});
