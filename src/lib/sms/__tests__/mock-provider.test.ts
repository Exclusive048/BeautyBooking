import { describe, expect, it } from "vitest";
import { createMockSmsProvider } from "../mock-provider";

describe("SMS-GATEWAY-A — mock provider (dev fallback)", () => {
  it("returns synthetic success so dev login keeps working", async () => {
    const provider = createMockSmsProvider();
    const result = await provider.send("+79991111111", "test message");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.messageId).toMatch(/^mock-\d+$/);
      expect(result.cost).toBe(0);
      expect(result.balanceLeft).toBe(9999);
    }
  });

  it("exposes a stub balance check that never blocks dev flows", async () => {
    const provider = createMockSmsProvider();
    const result = await provider.checkBalance();
    expect(result).toEqual({ success: true, balance: 9999, currency: "RUB" });
  });

  it("identifies itself as 'mock' for log differentiation", () => {
    expect(createMockSmsProvider().name).toBe("mock");
  });
});
