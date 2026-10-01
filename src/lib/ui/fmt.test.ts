import { describe, expect, it } from "vitest";
import { UI_FMT } from "@/lib/ui/fmt";

/**
 * Money-formatter regression tests (fix-01).
 *
 * Background: `UI_FMT.priceLabel` historically did not divide by 100,
 * which produced "200 000 ₽" instead of "2 000 ₽" on the master
 * dashboard. The fix locks the kopeks-in convention with these
 * cases.
 *
 * NB: `Intl.NumberFormat("ru-RU")` uses a non-breaking space as the
 * thousands separator. We use a regex strip below to avoid the test
 * being brittle to ICU version drift between Node releases.
 */

function stripSeparators(value: string): string {
  return value.replace(/\s+/g, " ");
}

describe("UI_FMT.priceLabel — kopeks → rubles formatting", () => {
  it("formats a typical price (200 000 kopeks → 2 000 ₽)", () => {
    expect(stripSeparators(UI_FMT.priceLabel(200000))).toBe("2 000 ₽");
  });

  it("rounds half-up (450 050 kopeks → 4 501 ₽)", () => {
    expect(stripSeparators(UI_FMT.priceLabel(450050))).toBe("4 501 ₽");
  });

  it("returns 0 ₽ for zero", () => {
    expect(UI_FMT.priceLabel(0)).toBe("0\u00a0₽");
  });

  it("returns 0 ₽ for negative values (defensive)", () => {
    expect(UI_FMT.priceLabel(-100)).toBe("0\u00a0₽");
  });

  it("ставит НЕРАЗРЫВНЫЙ пробел перед ₽ — знак не уезжает на новую строку (решение 24.2)", () => {
    expect(UI_FMT.priceLabel(450_000)).toBe("4\u00a0500\u00a0₽");
  });

  it("rounds 50 kopeks up to 1 ₽", () => {
    // 50 kopeks = 0.5 rubles → Math.round(0.5) → 1 (HALF_TO_EVEN
    // in some platforms, but Math.round always rounds half-up).
    expect(stripSeparators(UI_FMT.priceLabel(50))).toBe("1 ₽");
  });

  it("formats 1 000 kopeks → 10 ₽", () => {
    expect(stripSeparators(UI_FMT.priceLabel(1000))).toBe("10 ₽");
  });

  it("formats large amounts with thousands separator", () => {
    expect(stripSeparators(UI_FMT.priceLabel(12_345_600))).toBe("123 456 ₽");
  });
});

describe("UI_FMT.priceDurationLabel — combined", () => {
  it("formats both parts", () => {
    expect(stripSeparators(UI_FMT.priceDurationLabel(350000, 60))).toBe(
      "3 500 ₽ • 1 ч",
    );
  });
});

describe("UI_FMT.durationLabel — minutes (unchanged convention)", () => {
  it("renders hours when divisible by 60", () => {
    expect(UI_FMT.durationLabel(60)).toBe("1 ч");
    expect(UI_FMT.durationLabel(120)).toBe("2 ч");
  });

  it("renders minutes otherwise", () => {
    expect(UI_FMT.durationLabel(45)).toBe("45 мин");
    expect(UI_FMT.durationLabel(90)).toBe("90 мин");
  });

  it("returns '0 мин' for zero or negative", () => {
    expect(UI_FMT.durationLabel(0)).toBe("0 мин");
    expect(UI_FMT.durationLabel(-10)).toBe("0 мин");
  });
});

/**
 * 29.09 доработки · 24 (UI-20) — общие форматы вместо 13 копий: ноль, сокращения
 * крупных сумм и счётчиков, даты с обязательным поясом.
 */
describe("UI_FMT.priceLabelOrDash — «—» там, где ноль значит «нет данных» (решение 24.3)", () => {
  it("null, undefined, ноль и отрицательное — прочерк", () => {
    expect(UI_FMT.priceLabelOrDash(null)).toBe("\u2014");
    expect(UI_FMT.priceLabelOrDash(undefined)).toBe("\u2014");
    expect(UI_FMT.priceLabelOrDash(0)).toBe("\u2014");
    expect(UI_FMT.priceLabelOrDash(-500)).toBe("\u2014");
  });

  it("положительное — как priceLabel", () => {
    expect(UI_FMT.priceLabelOrDash(450_000)).toBe(UI_FMT.priceLabel(450_000));
  });
});

describe("UI_FMT.moneyShort / countShort — сокращения по-русски (решение 24.1)", () => {
  it("миллионы — «4,2 млн ₽», с запятой", () => {
    expect(UI_FMT.moneyShort(420_000_000)).toBe("4,2\u00a0млн\u00a0₽");
  });

  it("тысячи — «12 тыс ₽», без лишнего «,0»", () => {
    expect(UI_FMT.moneyShort(1_200_000)).toBe("12\u00a0тыс\u00a0₽");
    expect(UI_FMT.moneyShort(1_250_000)).toBe("12,5\u00a0тыс\u00a0₽");
  });

  it("меньше тысячи рублей — полная сумма; ноль — «0 ₽»", () => {
    expect(UI_FMT.moneyShort(95_000)).toBe("950\u00a0₽");
    expect(UI_FMT.moneyShort(0)).toBe("0\u00a0₽");
  });

  it("округление не даёт «1 000 тыс» — переходит в миллионы", () => {
    expect(UI_FMT.countShort(999_960)).toBe("1\u00a0млн");
  });

  it("счётчики — «1,2 тыс» и «1,2 млн», меньше тысячи — с разрядами как есть", () => {
    expect(UI_FMT.countShort(1_234)).toBe("1,2\u00a0тыс");
    expect(UI_FMT.countShort(1_234_567)).toBe("1,2\u00a0млн");
    expect(UI_FMT.countShort(987)).toBe("987");
  });
});

describe("UI_FMT.count / decimal", () => {
  it("count — разряды неразрывным пробелом", () => {
    expect(UI_FMT.count(1_412)).toBe("1\u00a0412");
  });

  it("decimal — ровно N знаков после запятой", () => {
    expect(UI_FMT.decimal(99.5, 1)).toBe("99,5");
    expect(UI_FMT.decimal(100, 1)).toBe("100,0");
  });
});

describe("UI_FMT.date — пояс обязателен и действительно применяется (rule 17)", () => {
  // 2026-08-12T20:30:00Z — в Москве ещё 12-е, в Екатеринбурге уже 13-е.
  const INSTANT = "2026-08-12T20:30:00.000Z";

  it("дата считается в переданном поясе, а не в поясе процесса", () => {
    expect(UI_FMT.date(INSTANT, "dayMonthLong", { timeZone: "Europe/Moscow" })).toBe("12 августа");
    expect(UI_FMT.date(INSTANT, "dayMonthLong", { timeZone: "Asia/Yekaterinburg" })).toBe("13 августа");
  });

  it("день с месяцем словом — без ведущего нуля", () => {
    expect(UI_FMT.date("2026-10-05T09:00:00.000Z", "dayMonthShort", { timeZone: "UTC" })).toBe("5 окт.");
  });

  it("дата со временем — 24-часовой формат", () => {
    expect(UI_FMT.date(INSTANT, "dayMonthShortTime", { timeZone: "Asia/Yekaterinburg" })).toBe("13 авг., 01:30");
    expect(UI_FMT.date(INSTANT, "dayMonthNumericTime", { timeZone: "Europe/Moscow" })).toBe("12.08, 23:30");
  });

  it("битая дата — прочерк, битый пояс из данных — не роняет поверхность", () => {
    expect(UI_FMT.date("not-a-date", "dayMonthLong", { timeZone: "Europe/Moscow" })).toBe("\u2014");
    expect(UI_FMT.date(INSTANT, "dayMonthLong", { timeZone: "Not/AZone" })).toBe("12 августа");
  });
});

describe("UI_FMT.dateKey — ключ даты салона без сдвига суток (UTC-tech)", () => {
  it("ключ читается как есть", () => {
    expect(UI_FMT.dateKey("2026-09-28", "weekdayDayMonthShort")).toBe("пн, 28 сент.");
    expect(UI_FMT.dateKey("2026-09-28", "dayMonthLong")).toBe("28 сентября");
  });

  it("непарсимый ключ возвращается как есть", () => {
    expect(UI_FMT.dateKey("когда-нибудь", "dayMonthLong")).toBe("когда-нибудь");
  });
});
