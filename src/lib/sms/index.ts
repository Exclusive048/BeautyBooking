import { env, isSmsConfigured } from "@/lib/env";
import { logError, logInfo } from "@/lib/logging/logger";
import { createMockSmsProvider } from "./mock-provider";
import { createSmscProvider } from "./smsc-provider";
import type { SmsProvider, SmsSendResult } from "./types";

export type { SmsProvider, SmsSendResult, SmsBalanceResult, SmsErrorCode } from "./types";

let _provider: SmsProvider | null = null;

/**
 * Lazy singleton. Selects SMSC.ru when `isSmsConfigured` (login+password set
 * and `SMS_PROVIDER_ENABLED=true`), otherwise the mock provider that logs
 * the OTP locally — preserves dev workflow when no SMS account is wired.
 *
 * Use `resetSmsProvider()` in tests to switch implementations between cases.
 */
export function getSmsProvider(): SmsProvider {
  if (_provider) return _provider;

  if (isSmsConfigured) {
    _provider = createSmscProvider({
      login: env.SMS_PROVIDER_LOGIN ?? "",
      password: env.SMS_PROVIDER_PASSWORD ?? "",
      sender: env.SMS_PROVIDER_SENDER,
    });
    logInfo("SMS provider initialised", { provider: _provider.name });
  } else {
    logInfo(
      "SMS provider not configured — using mock fallback (OTP visible in logs)",
    );
    _provider = createMockSmsProvider();
  }

  return _provider;
}

export function resetSmsProvider(): void {
  _provider = null;
}

export function setSmsProviderForTesting(provider: SmsProvider): void {
  _provider = provider;
}

export function buildOtpMessage(code: string): string {
  return `Код подтверждения МастерРядом: ${code}\nНикому не сообщайте код.`;
}

/**
 * Send OTP via configured provider. Logs delivery metadata (messageId,
 * cost, balanceLeft) on success — these are the retrospective signals
 * SMS-MONITORING-A will aggregate when monitoring lands.
 *
 * Never throws — caller chooses how to react via the result discriminant.
 */
export async function sendOtpSms(
  phone: string,
  code: string,
): Promise<SmsSendResult> {
  const provider = getSmsProvider();
  const message = buildOtpMessage(code);
  const result = await provider.send(phone, message);

  if (result.success) {
    logInfo("OTP SMS delivered", {
      provider: provider.name,
      phone,
      messageId: result.messageId,
      cost: result.cost,
      balanceLeft: result.balanceLeft,
    });
  } else {
    logError("OTP SMS delivery failed", {
      provider: provider.name,
      phone,
      error: result.error,
      message: result.message,
    });
  }

  return result;
}
