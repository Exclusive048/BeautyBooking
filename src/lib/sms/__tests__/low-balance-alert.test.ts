import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SMS-LOW-BALANCE-ALERT (FIX-B10) — порог перестал быть декоративным.
 *
 * До этого `SMS_LOW_BALANCE_THRESHOLD` была объявлена в `env.ts` и не имела ни
 * одного читателя: `balanceLeft` возвращался и логировался, но ни с чем не
 * сравнивался. Тот же класс, что `EMAIL_AUTH_ENABLED` без потребителей (SEC-02)
 * — переменная, описывающая намерение, а не поведение.
 *
 * @probe   что сломать: в `lib/sms/index.ts` заменить условие
 *          `if (balanceLeft > env.SMS_LOW_BALANCE_THRESHOLD) return;`
 *          на `if (true) return;` (то есть вернуть состояние «читателя нет»).
 *          наблюдалось: «баланс ниже порога — алерт уходит» красный,
 *          «expected "spy" to be called at least once»; остальные три теста
 *          файла остались зелёными, то есть сообщение точно указывает на сайт.
 *          восстановлено, `git diff src/lib/sms/index.ts` — только целевые
 *          правки FIX-B10, снова зелено.
 */

const sendTelegramAlertSpy = vi.fn(
  async (_message: string, _alertKey?: string, _cooldownMs?: number) => true,
);

vi.mock("@/lib/monitoring/alerts", () => ({
  sendTelegramAlert: (message: string, alertKey?: string, cooldownMs?: number) =>
    sendTelegramAlertSpy(message, alertKey, cooldownMs),
}));

vi.mock("@/lib/env", () => ({
  env: { SMS_LOW_BALANCE_THRESHOLD: 500 },
  isSmsConfigured: false,
}));

vi.mock("@/lib/logging/logger", () => ({
  logError: () => undefined,
  logInfo: () => undefined,
}));

import { maybeAlertLowSmsBalance } from "@/lib/sms";

describe("SMS · алерт о низком балансе", () => {
  beforeEach(() => {
    sendTelegramAlertSpy.mockClear();
  });

  afterEach(() => {
    sendTelegramAlertSpy.mockClear();
  });

  it("баланс ниже порога — алерт уходит", () => {
    maybeAlertLowSmsBalance(120);

    expect(sendTelegramAlertSpy).toHaveBeenCalledTimes(1);
    const [message, key, cooldown] = sendTelegramAlertSpy.mock.calls[0];
    expect(message).toContain("120");
    expect(message).toContain("500");
    // Ключ и окно — не косметика: без них алерт уходил бы на каждую отправку.
    expect(key).toBe("sms:low-balance");
    expect(cooldown).toBe(60 * 60 * 1000);
  });

  it("ровно на пороге — алерт уходит (порог включительно)", () => {
    maybeAlertLowSmsBalance(500);
    expect(sendTelegramAlertSpy).toHaveBeenCalledTimes(1);
  });

  it("баланс выше порога — тишина", () => {
    maybeAlertLowSmsBalance(501);
    expect(sendTelegramAlertSpy).not.toHaveBeenCalled();
  });

  it("нечисловой баланс не поднимает ложную тревогу", () => {
    // `parseFloat(...) || 0` в парсере может дать 0 на нераспознанном ответе;
    // NaN сюда прийти не должен, но ложный алерт «баланс 0» хуже молчания.
    maybeAlertLowSmsBalance(Number.NaN);
    expect(sendTelegramAlertSpy).not.toHaveBeenCalled();
  });
});
