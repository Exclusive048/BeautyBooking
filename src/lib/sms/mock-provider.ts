import { logInfo } from "@/lib/logging/logger";
import type { SmsProvider } from "./types";

/**
 * Dev / test fallback. Preserves the pre-SMS-GATEWAY behaviour of
 * writing the OTP code into application logs so that developers
 * (and integration tests) can read the code locally without an SMS
 * gateway. Selected by the factory when `isSmsConfigured()` returns false.
 *
 * Returns synthetic success so the OTP route does not enter its
 * fail-soft branch in dev — login keeps working.
 */
export function createMockSmsProvider(): SmsProvider {
  return {
    name: "mock",

    async send(phone, message) {
      logInfo("[MOCK SMS] would deliver", {
        phone,
        message,
      });
      return {
        success: true,
        messageId: `mock-${Date.now()}`,
        cost: 0,
        balanceLeft: 9999,
      };
    },

    async checkBalance() {
      return { success: true, balance: 9999, currency: "RUB" };
    },
  };
}
