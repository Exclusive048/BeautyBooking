import { logInfo } from "@/lib/logging/logger";
import { maskPhone } from "@/lib/logging/masking";
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
      // SECURITY-EXPOSURE-AUDIT-01 · Y21: mask the phone (152-ФЗ) as the rest of
      // the SMS layer does. `message` carries the OTP by design (dev-only mock,
      // CLAUDE.md rule 9) so it stays readable for local testing.
      logInfo("[MOCK SMS] would deliver", {
        phone: maskPhone(phone),
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
