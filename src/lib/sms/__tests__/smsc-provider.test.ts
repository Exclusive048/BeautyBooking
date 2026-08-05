import { describe, expect, it, vi } from "vitest";
import {
  buildSmscBalanceUrl,
  buildSmscSendUrl,
  createSmscProvider,
  parseSmscBalanceResponse,
  parseSmscSendResponse,
} from "../smsc-provider";

describe("SMS-GATEWAY-A — SMSC.ru request builders", () => {
  it("includes login/psw/phones/mes/fmt/charset in the send URL", () => {
    const url = buildSmscSendUrl({
      config: { login: "test-login", password: "test-pass" },
      phone: "+79001234567",
      message: "code 1234",
    });
    expect(url).toContain("login=test-login");
    expect(url).toContain("psw=test-pass");
    expect(url).toContain("phones=%2B79001234567");
    expect(url).toContain("mes=code+1234");
    expect(url).toContain("fmt=3");
    expect(url).toContain("charset=utf-8");
  });

  it("appends sender param when supplied", () => {
    const url = buildSmscSendUrl({
      config: { login: "x", password: "y", sender: "BEAUTY" },
      phone: "+79991111111",
      message: "hi",
    });
    expect(url).toContain("sender=BEAUTY");
  });

  it("omits sender param when not configured", () => {
    const url = buildSmscSendUrl({
      config: { login: "x", password: "y" },
      phone: "+79991111111",
      message: "hi",
    });
    expect(url).not.toContain("sender=");
  });

  it("balance URL includes login/psw/fmt/cur", () => {
    const url = buildSmscBalanceUrl({ login: "L", password: "P" });
    expect(url).toContain("login=L");
    expect(url).toContain("psw=P");
    expect(url).toContain("fmt=3");
    expect(url).toContain("cur=1");
  });
});

describe("SMS-GATEWAY-A — SMSC.ru response parser (send)", () => {
  it("parses successful send response into structured result", () => {
    const result = parseSmscSendResponse({
      id: 1234567,
      cnt: 1,
      cost: "2.95",
      balance: "1234.50",
    });
    expect(result).toEqual({
      success: true,
      messageId: "1234567",
      cost: 2.95,
      balanceLeft: 1234.5,
    });
  });

  it("maps SMSC error code 3 → INSUFFICIENT_BALANCE", () => {
    const result = parseSmscSendResponse({
      error: "Недостаточно средств",
      error_code: 3,
    });
    expect(result).toEqual({
      success: false,
      error: "INSUFFICIENT_BALANCE",
      message: "Недостаточно средств",
    });
  });

  it("maps SMSC error code 7 → INVALID_PHONE", () => {
    const result = parseSmscSendResponse({
      error: "Неверный номер",
      error_code: 7,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("INVALID_PHONE");
  });

  it("maps SMSC error code 2 → AUTH_FAILED", () => {
    const result = parseSmscSendResponse({
      error: "Неверный логин",
      error_code: 2,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("AUTH_FAILED");
  });

  it("maps SMSC error code 4 → IP_BLOCKED", () => {
    const result = parseSmscSendResponse({
      error: "IP blocked",
      error_code: 4,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("IP_BLOCKED");
  });

  it("maps SMSC error code 9 → RATE_LIMITED", () => {
    const result = parseSmscSendResponse({
      error: "Превышен лимит",
      error_code: 9,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("RATE_LIMITED");
  });

  it("maps unknown error code → UNKNOWN", () => {
    const result = parseSmscSendResponse({
      error: "What is this",
      error_code: 999,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("UNKNOWN");
  });

  it("treats empty/null payload as UNKNOWN error", () => {
    expect(parseSmscSendResponse(null).success).toBe(false);
    expect(parseSmscSendResponse({}).success).toBe(false);
  });
});

describe("SMS-GATEWAY-A — SMSC.ru response parser (balance)", () => {
  it("parses balance string into number", () => {
    const result = parseSmscBalanceResponse({ balance: "1500.75" });
    expect(result).toEqual({
      success: true,
      balance: 1500.75,
      currency: "RUB",
    });
  });

  it("returns error when payload carries error field", () => {
    const result = parseSmscBalanceResponse({
      error: "auth failed",
      error_code: 2,
    });
    expect(result).toEqual({ success: false, error: "auth failed" });
  });
});

describe("SMS-GATEWAY-A — createSmscProvider HTTP integration", () => {
  it("returns success result on 200 + valid JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 42, cnt: 1, cost: "1.50", balance: "100" }),
    });
    const provider = createSmscProvider({
      login: "u",
      password: "p",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.send("+79991111111", "hi");
    expect(result).toEqual({
      success: true,
      messageId: "42",
      cost: 1.5,
      balanceLeft: 100,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("returns PROVIDER_UNAVAILABLE on non-2xx HTTP", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
    });
    const provider = createSmscProvider({
      login: "u",
      password: "p",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.send("+79991111111", "hi");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("PROVIDER_UNAVAILABLE");
  });

  it("returns PROVIDER_UNAVAILABLE on fetch throw", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const provider = createSmscProvider({
      login: "u",
      password: "p",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.send("+79991111111", "hi");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("PROVIDER_UNAVAILABLE");
      expect(result.message).toContain("ECONNRESET");
    }
  });
});

/**
 * RES-08 — запрос к шлюзу шёл без верхней границы.
 *
 * Fail-soft провайдера построен на возврате `PROVIDER_UNAVAILABLE`, то есть
 * отрабатывает ПОСЛЕ возврата вызова, — а без границы возврата могло не быть
 * вовсе: вызов инлайновый на пути выпуска OTP, и зависший шлюз держит запрос
 * пользователя. Сегодня P2 только из-за выключенного `PHONE_AUTH_ENABLED`.
 */
describe("RES-08 — граница запроса к SMSC", () => {
  const config = { login: "u", password: "p" };

  it("send передаёт AbortSignal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, cnt: 1, cost: "1", balance: "10" }),
    });
    const provider = createSmscProvider({
      ...config,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await provider.send("+79991111111", "hi");

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("checkBalance передаёт AbortSignal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ balance: "10", currency: "RUB" }),
    });
    const provider = createSmscProvider({
      ...config,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await provider.checkBalance();

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("срабатывание таймаута отдаёт штатный fail-soft, а не пробрасывает бросок", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const provider = createSmscProvider({
      ...config,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.send("+79991111111", "hi");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("PROVIDER_UNAVAILABLE");
  });
});
