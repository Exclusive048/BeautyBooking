import { describe, it, expect } from "vitest";
import {
  formatRussianPhoneInput,
  formatRussianPhoneInputOnChange,
  isCompleteRussianPhoneInput,
  russianPhoneDigits,
} from "@/lib/phone/input-format";
import { normalizeRussianPhone } from "@/lib/phone/russia";

/**
 * PHONE-CLAIM-01 — маска «+7 (999) 123-45-67» для кабинетных полей телефона.
 *
 * @probe Прогнан со сломанными входами: (а) удаление среза кода страны в
 * `russianPhoneDigits` валит кейсы «+7 (9» → «9» и вставку «+7999…»;
 * (б) формат без обработки «липкой маски» валит Backspace-кейс (строка
 * возвращалась той же); (в) разделитель «.» вместо «-» валит сквозной тест
 * совместимости с `normalizeRussianPhone`.
 */

describe("russianPhoneDigits", () => {
  it("срезает код страны из всех принятых форм", () => {
    expect(russianPhoneDigits("+79991234567")).toBe("9991234567");
    expect(russianPhoneDigits("89991234567")).toBe("9991234567");
    expect(russianPhoneDigits("79991234567")).toBe("9991234567");
    expect(russianPhoneDigits("8 999 123-45-67")).toBe("9991234567");
  });

  it("частичный ввод под маской не теряет первую цифру", () => {
    expect(russianPhoneDigits("+7 (9")).toBe("9");
    expect(russianPhoneDigits("+7 (999) 12")).toBe("99912");
  });

  it("лишние цифры отбрасываются до 10", () => {
    expect(russianPhoneDigits("+7999123456789")).toBe("9991234567");
  });
});

describe("formatRussianPhoneInput", () => {
  it("прогрессивная маска по мере набора", () => {
    expect(formatRussianPhoneInput("9")).toBe("+7 (9");
    expect(formatRussianPhoneInput("999")).toBe("+7 (999)");
    expect(formatRussianPhoneInput("9991")).toBe("+7 (999) 1");
    expect(formatRussianPhoneInput("999123")).toBe("+7 (999) 123");
    expect(formatRussianPhoneInput("99912345")).toBe("+7 (999) 123-45");
    expect(formatRussianPhoneInput("9991234567")).toBe("+7 (999) 123-45-67");
  });

  it("идемпотентна — форматирует и ввод, и канон сервера", () => {
    const formatted = formatRussianPhoneInput("+79991234567");
    expect(formatted).toBe("+7 (999) 123-45-67");
    expect(formatRussianPhoneInput(formatted)).toBe(formatted);
  });

  it("вставка «8 999 …» приводится к той же маске", () => {
    expect(formatRussianPhoneInput("8 999 123-45-67")).toBe("+7 (999) 123-45-67");
  });

  it("пустой ввод остаётся пустым (поле можно очистить)", () => {
    expect(formatRussianPhoneInput("")).toBe("");
    expect(formatRussianPhoneInput("   ")).toBe("");
  });

  it("полный результат принимается normalizeRussianPhone (сквозная совместимость)", () => {
    expect(normalizeRussianPhone(formatRussianPhoneInput("9991234567"))).toBe("+79991234567");
  });
});

describe("formatRussianPhoneInputOnChange — липкая маска", () => {
  it("Backspace на разделителе срезает и последнюю цифру", () => {
    // «+7 (999)» → Backspace даёт «+7 (999» — цифры те же, наивный reformat
    // вернул бы «+7 (999)» и поле бы «не удалялось».
    expect(formatRussianPhoneInputOnChange("+7 (999)", "+7 (999")).toBe("+7 (99");
    expect(formatRussianPhoneInputOnChange("+7 (999) 123-45", "+7 (999) 123-4")).toBe(
      "+7 (999) 123-4"
    );
  });

  it("удаление последней цифры оставляет якорь «+7», удаление якоря очищает поле", () => {
    expect(formatRussianPhoneInputOnChange("+7 (9", "+7 (")).toBe("+7");
    expect(formatRussianPhoneInputOnChange("+7", "+")).toBe("");
    expect(formatRussianPhoneInputOnChange("+7 (999)", "")).toBe("");
  });

  it("обычный набор форматируется прогрессивно", () => {
    expect(formatRussianPhoneInputOnChange("+7 (99", "+7 (999")).toBe("+7 (999)");
    expect(formatRussianPhoneInputOnChange("", "9")).toBe("+7 (9");
  });

  it("вставка целого номера в пустое поле", () => {
    expect(formatRussianPhoneInputOnChange("", "89991234567")).toBe("+7 (999) 123-45-67");
  });
});

describe("isCompleteRussianPhoneInput", () => {
  it("полный номер под маской — полный", () => {
    expect(isCompleteRussianPhoneInput("+7 (999) 123-45-67")).toBe(true);
  });
  it("недобранный — нет", () => {
    expect(isCompleteRussianPhoneInput("+7 (999) 123-45-6")).toBe(false);
    expect(isCompleteRussianPhoneInput("+7")).toBe(false);
    expect(isCompleteRussianPhoneInput("")).toBe(false);
  });
});
