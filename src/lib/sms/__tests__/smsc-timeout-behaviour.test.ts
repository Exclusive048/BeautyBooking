import { describe, expect, it } from "vitest";

import { createSmscProvider } from "@/lib/sms/smsc-provider";
import { createHangingFetch } from "@/lib/testing/hanging-fetch";

/**
 * RES — верхняя граница обращений к SMSC.ru. Сторожа у этого сайта НЕ БЫЛО
 * вовсе (FIX-B10): дедлайн в коде стоял, но ничто не мешало его снять.
 *
 * Почему это важнее, чем кажется по нынешнему трафику. `send` вызывается
 * ИНЛАЙНОВО на пути выпуска OTP (`api/auth/otp/request/route.ts`), то есть
 * зависший шлюз держит запрос пользователя — ровно та же механика, что у SMTP
 * (RES-05). Сегодня это дремлет только потому, что `PHONE_AUTH_ENABLED` в
 * проде выключен; в день включения телефонного входа цена станет той же.
 *
 * Стенд подключается через `config.fetchImpl` — реализация здесь инжектируется
 * параметром, поэтому глобальный `fetch` подменять не нужно.
 *
 * Проверяются обе половины, и вторая — главная: провайдер обязан **вернуть**
 * `{ success: false }`, а не бросить. Роут (`otp/request`) читает дискриминант
 * и отдаёт собственный 503 `SMS_SEND_FAILED`;брошенное исключение вместо
 * этого дало бы 500 и потеряло бы курируемое сообщение.
 *
 * @probe   что сломать: убрать `signal: AbortSignal.timeout(SMSC_REQUEST_TIMEOUT_MS)`
 *          из `send` в `lib/sms/smsc-provider.ts`.
 *          наблюдалось: «send: зависший шлюз отдаёт fail-soft внутри границы»
 *          — красный, «Test timed out in 16000ms».
 *          восстановлено, `git diff src/lib/sms/smsc-provider.ts` пуст, зелено.
 */

const DECLARED_TIMEOUT_MS = 10_000;
const SLACK_MS = 4_000;

const CONFIG = { login: "l", password: "p", sender: "s" };

describe("SMSC · дедлайн срабатывает и fail-soft ветка отрабатывает", () => {
  it(
    "send: зависший шлюз отдаёт fail-soft внутри границы, а не бросает",
    async () => {
      const harness = createHangingFetch();
      const provider = createSmscProvider({ ...CONFIG, fetchImpl: harness.fetch });

      const startedAt = Date.now();
      // Без `.catch`: бросок здесь провалит тест — это и есть предмет проверки.
      const result = await provider.send("+79991234567", "код");
      const elapsed = Date.now() - startedAt;

      expect(harness.callCount(), "запрос к шлюзу не дошёл до fetch").toBe(1);
      expect(
        elapsed,
        `send висел ${elapsed} мс при границе ${DECLARED_TIMEOUT_MS} мс`,
      ).toBeLessThan(DECLARED_TIMEOUT_MS + SLACK_MS);
      expect(elapsed, "отказ пришёл мгновенно — это не таймаут").toBeGreaterThan(
        DECLARED_TIMEOUT_MS / 2,
      );

      // Форма отказа — контракт с роутом выпуска OTP.
      expect(result.success).toBe(false);
      if (result.success) throw new Error("unreachable");
      expect(result.error).toBe("PROVIDER_UNAVAILABLE");
      expect(result.message, "сообщение об отказе пустое").toBeTruthy();

      harness.release();
    },
    DECLARED_TIMEOUT_MS + SLACK_MS + 6_000,
  );

  it(
    "checkBalance: тот же дедлайн и тот же fail-soft",
    async () => {
      const harness = createHangingFetch();
      const provider = createSmscProvider({ ...CONFIG, fetchImpl: harness.fetch });

      const startedAt = Date.now();
      const result = await provider.checkBalance();
      const elapsed = Date.now() - startedAt;

      expect(elapsed).toBeLessThan(DECLARED_TIMEOUT_MS + SLACK_MS);
      expect(elapsed).toBeGreaterThan(DECLARED_TIMEOUT_MS / 2);
      expect(result.success).toBe(false);

      harness.release();
    },
    DECLARED_TIMEOUT_MS + SLACK_MS + 6_000,
  );
});
