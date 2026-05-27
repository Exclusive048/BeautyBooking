import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOtpMessage,
  resetSmsProvider,
  sendOtpSms,
  setSmsProviderForTesting,
} from "..";
import type { SmsProvider } from "../types";

describe("SMS-GATEWAY-A — OTP message format", () => {
  it("contains brand, code, и подсказку безопасности на русском", () => {
    const text = buildOtpMessage("4729");
    expect(text).toContain("МастерРядом");
    expect(text).toContain("4729");
    expect(text).toContain("Никому не сообщайте код");
  });

  it("varies only by the code argument", () => {
    expect(buildOtpMessage("1111")).not.toEqual(buildOtpMessage("2222"));
  });
});

describe("SMS-GATEWAY-A — sendOtpSms with injected provider", () => {
  beforeEach(() => {
    resetSmsProvider();
  });
  afterEach(() => {
    resetSmsProvider();
  });

  it("delegates to provider.send with formatted OTP message", async () => {
    const send = vi.fn().mockResolvedValue({
      success: true,
      messageId: "abc",
      cost: 1,
      balanceLeft: 500,
    });
    const stub: SmsProvider = {
      name: "stub",
      send,
      checkBalance: async () => ({
        success: true,
        balance: 500,
        currency: "RUB",
      }),
    };
    setSmsProviderForTesting(stub);

    const result = await sendOtpSms("+79991111111", "9988");
    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    const [phone, message] = send.mock.calls[0]!;
    expect(phone).toBe("+79991111111");
    expect(message).toContain("9988");
    expect(message).toContain("МастерРядом");
  });

  it("propagates provider errors without throwing", async () => {
    const stub: SmsProvider = {
      name: "stub",
      send: async () => ({
        success: false,
        error: "INSUFFICIENT_BALANCE",
        message: "no money",
      }),
      checkBalance: async () => ({
        success: false,
        error: "noop",
      }),
    };
    setSmsProviderForTesting(stub);

    const result = await sendOtpSms("+79991111111", "0000");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("INSUFFICIENT_BALANCE");
    }
  });
});
