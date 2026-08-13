import { describe, expect, it, vi } from "vitest";

/**
 * FIX-B14 · OTP-RATE-LIMIT-RAW-ENVELOPE — отказ лимитера OTP уезжает конвертом
 * проекта с русским текстом.
 *
 * Проверяется ПОВЕДЕНИЕ разобранного ответа, а не факт вызова `fail()`:
 * «позвали правильную функцию» — это форма кода, и она была бы удовлетворена
 * `fail(refusal.error, …)`, то есть ровно тем дефектом, против которого сторож
 * заведён (машинный код в поле сообщения).
 *
 * @probe   что сломать: в `REFUSAL_COPY` заменить сообщение
 *          `RATE_LIMIT_UNAVAILABLE` на `refusal.error`-подобное
 *          `"RATE_LIMIT_UNAVAILABLE"`.
 *          наблюдалось: «обрыв Redis: сообщение по-русски и это НЕ код ошибки:
 *          expected 'RATE_LIMIT_UNAVAILABLE' to match /[А-Яа-яЁё]/» — падает
 *          утверждение о тексте, а не о статусе.
 */

vi.mock("@/lib/logging/logger", () => ({
  logError: vi.fn(),
  getRequestId: () => "req-1",
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));

import { otpRateLimitFail } from "@/lib/auth/otp-rate-limit-response";

const CYRILLIC = /[А-Яа-яЁё]/;

async function body(res: Response) {
  return (await res.json()) as {
    ok: boolean;
    error: { message: string; code?: string; details?: { retryAfterSeconds?: number } };
  };
}

describe("otpRateLimitFail", () => {
  it("обрыв Redis: 503, конверт проекта, сообщение по-русски и это НЕ код ошибки", async () => {
    const res = otpRateLimitFail({
      ok: false,
      status: 503,
      error: "RATE_LIMIT_UNAVAILABLE",
      retryAfterSec: 60,
    });
    const json = await body(res);
    expect(json.error.message).toMatch(CYRILLIC);
    expect(json.error.message).not.toBe("RATE_LIMIT_UNAVAILABLE");
    expect(json.ok).toBe(false);
    expect(res.status).toBe(503);
    expect(json.error.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("исчерпанный бюджет отличим от обрыва: 429 RATE_LIMITED, свой текст", async () => {
    const res = otpRateLimitFail({ ok: false, status: 429, error: "RATE_LIMIT", retryAfterSec: 300 });
    const json = await body(res);
    // FIX-B12 сделал это различие видимым у прокси; здесь — та же пара.
    expect(res.status).toBe(429);
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(json.error.message).toMatch(CYRILLIC);
    expect(json.error.details?.retryAfterSeconds).toBe(300);
  });

  it("блокировка после неверных кодов: свой текст, не общий про «много запросов»", async () => {
    const locked = await body(
      otpRateLimitFail({ ok: false, status: 429, error: "OTP_LOCKED", retryAfterSec: 900 }),
    );
    const budget = await body(
      otpRateLimitFail({ ok: false, status: 429, error: "RATE_LIMIT", retryAfterSec: 900 }),
    );
    expect(locked.error.message).toMatch(CYRILLIC);
    expect(locked.error.message).not.toBe(budget.error.message);
  });

  it("ни один исход не отдаёт машинный код в поле сообщения", async () => {
    const refusals = ["RATE_LIMIT", "RATE_LIMIT_UNAVAILABLE", "OTP_LOCKED"] as const;
    for (const error of refusals) {
      const json = await body(otpRateLimitFail({ ok: false, status: 429, error, retryAfterSec: 1 }));
      expect(json.error.message).toMatch(CYRILLIC);
      expect(json.error.message).not.toMatch(/^[A-Z_]+$/);
    }
  });
});
