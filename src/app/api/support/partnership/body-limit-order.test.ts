import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-16 — на `/api/support/partnership` рейт-лимит стоял ПОСЛЕ `req.json()`:
 * 429 выдавался уже после того, как произвольно большой JSON прочитан и
 * разобран, то есть ограничитель не ограничивал самую дорогую часть запроса.
 *
 * Порядок проверяется не чтением кода, а наблюдаемым поведением:
 *   - лимит исчерпан + тело — заведомо невалидный JSON → 429, а не 400
 *     (при старом порядке разбор падал первым и отвечал 400);
 *   - перебор размера → 413, то есть тело до разбора не доходит.
 *
 * Перебор проверяется ПОСЛЕ лимитера намеренно: злоупотребление должно тратить
 * квоту, а не обходить её дешёвым отказом.
 */

const checkRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/http/ip", () => ({ extractClientIp: () => "1.2.3.4" }));
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({}) }) },
}));
vi.mock("@/lib/logging/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logging/logger")>();
  return { ...actual, logError: vi.fn(), logInfo: vi.fn() };
});

import { MAX_JSON_BODY_BYTES } from "@/lib/http/body-limit";
import { POST } from "./route";

function makeRequest(rawBody: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/support/partnership", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/support/partnership — порядок проверок (SEC-16)", () => {
  it("отвечает 429 на исчерпанном лимите, не разбирая тело", async () => {
    checkRateLimit.mockResolvedValue(false);
    const res = await POST(makeRequest("{ это не JSON"));
    expect(res.status).toBe(429);
  });

  it("отвечает 413 на переборе размера — тело до разбора не доходит", async () => {
    checkRateLimit.mockResolvedValue(true);
    const res = await POST(
      makeRequest("{}", { "content-length": String(MAX_JSON_BODY_BYTES + 1) }),
    );
    expect(res.status).toBe(413);
  });

  it("в пределах лимита и планки разбирает тело как раньше", async () => {
    checkRateLimit.mockResolvedValue(true);
    const res = await POST(makeRequest("{ это не JSON"));
    expect(res.status).toBe(400);
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
  });
});
