/**
 * SMS provider abstraction. Implementations live alongside this file
 * (`smsc-provider.ts`, `mock-provider.ts`). The factory in `./index.ts`
 * picks one based on `isSmsConfigured` from `@/lib/env`.
 *
 * Designed to be swap-friendly: adding a new provider (SmsAero, Twilio)
 * means writing a new module that satisfies `SmsProvider` and extending
 * the factory — call sites (`sendOtpSms`) stay untouched.
 */

export type SmsErrorCode =
  | "INVALID_PHONE"
  | "INSUFFICIENT_BALANCE"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "AUTH_FAILED"
  | "IP_BLOCKED"
  | "MESSAGE_REJECTED"
  | "UNKNOWN";

export type SmsSendResult =
  | {
      success: true;
      messageId: string;
      cost: number;
      balanceLeft: number;
    }
  | {
      success: false;
      error: SmsErrorCode;
      message: string;
    };

export type SmsBalanceResult =
  | { success: true; balance: number; currency: string }
  | { success: false; error: string };

export interface SmsProvider {
  readonly name: string;
  send(phone: string, message: string): Promise<SmsSendResult>;
  checkBalance(): Promise<SmsBalanceResult>;
}
