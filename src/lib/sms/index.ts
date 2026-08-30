import { env, isSmsConfigured } from "@/lib/env";
import { logError, logInfo } from "@/lib/logging/logger";
import { maskPhone } from "@/lib/logging/masking";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { createMockSmsProvider } from "./mock-provider";
import { createSmscProvider } from "./smsc-provider";
import type { SmsProvider, SmsSendResult } from "./types";

export type { SmsProvider, SmsSendResult, SmsBalanceResult, SmsErrorCode } from "./types";

let _provider: SmsProvider | null = null;

/**
 * Lazy singleton. Selects SMSC.ru when `isSmsConfigured` (login+password set;
 * ENV-SPLIT-01 — флаг SMS_PROVIDER_ENABLED удалён), otherwise the mock
 * provider that logs the OTP locally — preserves dev workflow when no SMS
 * account is wired. В production без кредов phone-вход выключен целиком
 * (`isPhoneAuthEnabled`), так что mock туда недостижим.
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
 * SMS-LOW-BALANCE-ALERT (FIX-B10). `SMS_LOW_BALANCE_THRESHOLD` была объявлена
 * в `env.ts` с дефолтом 500 и **не имела ни одного читателя** (найдено
 * SNAPSHOT-SWEEP, §7): слой возвращал `balanceLeft`, но ни с чем его не
 * сравнивал. То есть алерта о низком балансе не существовало — была переменная,
 * описывающая намерение.
 *
 * Почему это чинится сейчас, а не «когда будет мониторинг»: сигнал становится
 * нужен в тот же день, когда включается `PHONE_AUTH_ENABLED`. Исчерпанный
 * баланс SMSC выглядит как «код не приходит» — при полностью здоровых наших
 * сервисах, без единой ошибки в логах и без единого упавшего запроса.
 *
 * Ничего нового не строится, соединяется существующее:
 *   • значение — `result.balanceLeft`, который `send` уже возвращает (второго
 *     обращения к шлюзу нет: лишний вызов на каждом выпуске OTP — это трафик
 *     и деньги ради числа, которое уже пришло в ответе);
 *   • порог — `env.SMS_LOW_BALANCE_THRESHOLD`;
 *   • доставка — `sendTelegramAlert`, у которого УЖЕ есть окно молчания
 *     (Redis + memory-fallback). Без него алерт уходил бы на КАЖДУЮ отправку
 *     ниже порога, то есть тем чаще, чем хуже дела.
 *
 * Окно — час: баланс не восстанавливается сам, повторять чаще нечего.
 * Ключ фиксированный (`sms:low-balance`), поэтому окно общее на все инстансы.
 * `void` + собственный `catch` — доставка алерта не имеет права повлиять на
 * выпуск OTP; отказ телеметрии не должен стоить пользователю входа.
 */
const LOW_BALANCE_ALERT_KEY = "sms:low-balance";
const LOW_BALANCE_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

export function maybeAlertLowSmsBalance(balanceLeft: number): void {
  if (!Number.isFinite(balanceLeft)) return;
  if (balanceLeft > env.SMS_LOW_BALANCE_THRESHOLD) return;

  void sendTelegramAlert(
    `Баланс SMS-провайдера низкий: ${balanceLeft} (порог ${env.SMS_LOW_BALANCE_THRESHOLD}). ` +
      `При исчерпании коды входа перестанут доходить.`,
    LOW_BALANCE_ALERT_KEY,
    LOW_BALANCE_ALERT_COOLDOWN_MS,
  ).catch((error: unknown) => {
    logError("SMS low-balance alert failed", {
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
  });
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
      phone: maskPhone(phone),
      messageId: result.messageId,
      cost: result.cost,
      balanceLeft: result.balanceLeft,
    });
    maybeAlertLowSmsBalance(result.balanceLeft);
  } else {
    logError("OTP SMS delivery failed", {
      provider: provider.name,
      phone: maskPhone(phone),
      error: result.error,
      message: result.message,
    });
  }

  return result;
}
