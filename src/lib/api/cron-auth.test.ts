import { describe, expect, it } from "vitest";

import { isAuthorizedCronRequest } from "@/lib/api/cron-auth";

/**
 * SEC-21 — три cron-роута читали секрет из заголовка `x-cron-token`, а при его
 * отсутствии — из `?token=`. Query-строка попадает в access-логи балансировщика,
 * в реферер и в историю браузера; секрету там не место. Заголовок поддерживался
 * и раньше, то есть query-ветка была удобством, а не необходимостью.
 */

function req(init: { headers?: Record<string, string>; url?: string } = {}) {
  return new Request(init.url ?? "http://localhost/api/billing/renew/run", {
    method: "POST",
    headers: init.headers,
  });
}

describe("isAuthorizedCronRequest — SEC-21", () => {
  it("пропускает верный секрет в заголовке", () => {
    expect(isAuthorizedCronRequest(req({ headers: { "x-cron-token": "s3cret" } }), "s3cret")).toBe(
      true,
    );
  });

  it("НЕ принимает секрет из query — это и есть находка", () => {
    expect(
      isAuthorizedCronRequest(
        req({ url: "http://localhost/api/billing/renew/run?token=s3cret" }),
        "s3cret",
      ),
    ).toBe(false);
  });

  it("query не спасает даже при пустом заголовке", () => {
    expect(
      isAuthorizedCronRequest(
        req({ url: "http://localhost/api/billing/renew/run?token=s3cret", headers: { "x-cron-token": "  " } }),
        "s3cret",
      ),
    ).toBe(false);
  });

  it("неверный секрет отклоняется", () => {
    expect(isAuthorizedCronRequest(req({ headers: { "x-cron-token": "wrong" } }), "s3cret")).toBe(
      false,
    );
  });

  it("fail-closed: секрет не задан в env → отказ, а не свободный доступ", () => {
    expect(isAuthorizedCronRequest(req({ headers: { "x-cron-token": "s3cret" } }), undefined)).toBe(
      false,
    );
    expect(isAuthorizedCronRequest(req({ headers: { "x-cron-token": "" } }), "")).toBe(false);
    expect(isAuthorizedCronRequest(req({ headers: { "x-cron-token": "  " } }), "   ")).toBe(false);
  });

  it("обрезает пробелы вокруг обеих сторон", () => {
    expect(
      isAuthorizedCronRequest(req({ headers: { "x-cron-token": "  s3cret  " } }), " s3cret "),
    ).toBe(true);
  });
});
