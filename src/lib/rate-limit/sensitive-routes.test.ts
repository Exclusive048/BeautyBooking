import { describe, expect, it } from "vitest";

import { isSensitiveRouteKey } from "@/lib/rate-limit/index";
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
});
