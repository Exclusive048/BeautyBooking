import { describe, expect, it } from "vitest";
import { moneyRUBFromKopeks } from "@/lib/format";
import { kopeksToRublesInput, parseRublesToKopeks } from "@/lib/money/kopeks";

/**
 * 29.09 доработки · 24 — поле цены в редакторе тарифа (админка) заполнялось
 * отформатированной строкой: `Intl` ставит НЕРАЗРЫВНЫЙ пробел перед «₽», а
 * `.replace(" ₽", "")` снимал только обычный — в поле оставалось «3 500 ₽», и
 * сохранение без перепечатки цены отвечало «неверная цена».
 */
describe("kopeksToRublesInput ↔ parseRublesToKopeks — поле ввода цены", () => {
  it.each([0, 100, 60_000, 162_000, 350_050, 1_135_000])("%i коп. → поле → те же копейки", (kopeks) => {
    expect(parseRublesToKopeks(kopeksToRublesInput(kopeks))).toBe(kopeks);
  });

  it("отформатированная строка с ₽ — не значение поля (так выглядела находка)", () => {
    const legacy = moneyRUBFromKopeks(350_000).replace(" ₽", "").replace(",", ".");
    expect(parseRublesToKopeks(legacy)).toBeNull();
  });

  it("ручной ввод с запятой и пробелами по-прежнему читается", () => {
    expect(parseRublesToKopeks("3 500,50")).toBe(350_050);
    expect(parseRublesToKopeks("")).toBe(0);
    expect(parseRublesToKopeks("абв")).toBeNull();
  });
});
