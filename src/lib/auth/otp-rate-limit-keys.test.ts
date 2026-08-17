import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as keys from "@/lib/auth/otp-rate-limit-keys";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * FIX-D1 — QA-харнесс чистит ИМЕННО те ключи, которые пишет рантайм.
 *
 * ## Что было
 *
 * Имена ключей выводились дважды: в рантайме и второй копией в
 * `.qa/otp.ts`. Копия протухла молча и дважды (SMOKE-02 · Ф-2):
 * предполагала `sha256("unknown")` там, где продукт пишет `sha256("::1")`, и
 * не знала про измерение, добавленное SEC-26. Итог — серия холодных логинов
 * упиралась в 429, неотличимый от сломанного логина.
 *
 * ## Что проверяется
 *
 * Не «совпадают ли две копии» (копия одна — модуль общий, и такой тест был бы
 * тавтологией), а **полнота набора для очистки**: каждый билдер ключа,
 * экспортированный модулем, обязан попадать в `allOtpRateLimitKeys`. Ровно это
 * и сломалось при SEC-26 — измерение добавили, в набор не внесли.
 *
 * @probe   что сломать: убрать `otpRequestIdentityIpKey(...)` из массива в
 *          `allOtpRateLimitKeys` (форма регрессии SEC-26 — добавили измерение,
 *          набор не обновили).
 *          наблюдалось: «билдер ключа не попадает в набор очистки:
 *          otpRequestIdentityIpKey» → красный. Восстановлено, зелено.
 *
 *          Второй пробой (правдоподобная форма, правило 9 GUARD-INTEGRITY):
 *          вернуть в `.qa/otp.ts` собственный расчёт `sha256("unknown")` вместо
 *          импорта — наблюдалось «харнесс выводит ключи сам, а не общим
 *          модулем: otp:request:ip:` в тесте ниже. Восстановлено, зелено.
 */

const IDENTITY = "+79995000000";
const IP = "::1";

/** Все экспортированные билдеры одиночных ключей — источник ожиданий. */
const SINGLE_KEY_BUILDERS = [
  "otpRequestIpKey",
  "otpRequestIdentityIpKey",
  "otpRequestIdentityKey",
  "otpVerifyLockKey",
  "otpVerifyFailKey",
] as const;

describe("FIX-D1 · набор очистки полон по построению", () => {
  it("🔴 каждый билдер ключа представлен в allOtpRateLimitKeys", () => {
    const cleared = new Set(keys.allOtpRateLimitKeys("phone", IDENTITY, IP));

    for (const name of SINGLE_KEY_BUILDERS) {
      const builder = keys[name] as (...args: unknown[]) => string;
      // Билдеры различаются арностью: IP-ключ берёт только IP, ключ идентичности
      // — канал и идентичность. Вызываем полным набором аргументов: лишние
      // игнорируются, и это дешевле, чем вести таблицу сигнатур.
      const produced =
        name === "otpRequestIpKey"
          ? builder(IP)
          : name === "otpRequestIdentityKey"
            ? builder("phone", IDENTITY)
            : builder("phone", IDENTITY, IP);

      expect(
        cleared.has(produced),
        `билдер ключа не попадает в набор очистки: ${name} → ${produced}. ` +
          "Именно так SEC-26 добавил измерение, которого харнесс не чистил, " +
          "и холодные логины стали упираться в 429 (SMOKE-02 · Ф-2).",
      ).toBe(true);
    }
  });

  it("email — свой набор, не пересекается с телефонным", () => {
    const phone = new Set(keys.allOtpRateLimitKeys("phone", IDENTITY, IP));
    const email = keys.allOtpRateLimitKeys("email", "a@b.test", IP);
    // Общий у каналов ровно один ключ — IP-бюджет выпуска.
    const shared = email.filter((k) => phone.has(k));
    expect(shared).toEqual([keys.otpRequestIpKey(IP)]);
  });

  it("email нормализуется к нижнему регистру до хеширования", () => {
    expect(keys.otpRequestIdentityKey("email", "A@B.test")).toBe(
      keys.otpRequestIdentityKey("email", "a@b.test"),
    );
  });

  it("🔴 пустой/отсутствующий IP схлопывается в «unknown» — и это НЕ то же, что «::1»", () => {
    // Половина дефекта SMOKE-02 · Ф-2: харнесс считал, что на localhost продукт
    // хеширует «unknown». Обе формы легитимны, но это РАЗНЫЕ ключи, и путать их
    // нельзя — на этом и держалась незамечаемая протечка.
    expect(keys.otpRequestIpKey(null)).toBe(keys.otpRequestIpKey("unknown"));
    expect(keys.otpRequestIpKey("::1")).not.toBe(keys.otpRequestIpKey("unknown"));
  });
});

describe("FIX-D1 · обе стороны берут имена из общего модуля", () => {
  it("рантайм не собирает имена ключей литералами", () => {
    const source = stripComments(
      readFileSync(resolve(process.cwd(), "src/lib/auth/otp-rate-limit.ts"), "utf8"),
    );
    const literals = source.match(/`otp:[^`]*`/g) ?? [];
    expect(
      literals,
      `рантайм вернулся к литеральным именам ключей: ${literals.join(", ")}. ` +
        "Тогда харнесс снова начнёт чистить не то, и 429 будет читаться как поломка логина.",
    ).toEqual([]);
  });

  it("🔴 харнесс не выводит имена сам, а импортирует их", () => {
    const source = stripComments(readFileSync(resolve(process.cwd(), ".qa/otp.ts"), "utf8"));
    expect(
      source.includes("allOtpRateLimitKeys"),
      "харнесс перестал импортировать общий вывод ключей",
    ).toBe(true);
    const selfDerived = source.match(/`otp:[^`]*`/g) ?? [];
    expect(
      selfDerived,
      `харнесс выводит ключи сам, а не общим модулем: ${selfDerived.join(", ")}`,
    ).toEqual([]);
  });
});
