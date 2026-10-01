import { describe, expect, it } from "vitest";
import {
  RF_ADMIN_TIMEZONES,
  RF_PICKER_TIMEZONES,
  TIMEZONE_OPTIONS,
  buildTimezoneOptions,
  isSelectableTimeZone,
} from "@/lib/ui/timezone-options";
import { TZ_CITY_RF, TZ_CITY_RU } from "@/lib/ui/zone-label";
import { isValidTimeZone } from "@/lib/schedule/timezone";

/**
 * 29.09 доработки · 28 — выбрать можно только пояс России, а подписывается
 * время по-прежнему и для зон СНГ.
 *
 * @probe 2026-10-01 — в `RF_PICKER_TIMEZONES` вписан `Asia/Tashkent`: покраснели
 * «список выбора кабинета ⊂ блок РФ словаря» и «по одной зоне на смещение». В
 * `TZ_CITY_RF` дописан `Asia/Almaty`: покраснели «зоны РФ — замороженный список»
 * и «новая зона СНГ — нет». Возвращено — зелёный.
 */

describe("списки выбора — только Россия", () => {
  it("список выбора кабинета ⊂ блок РФ словаря", () => {
    const outside = RF_PICKER_TIMEZONES.filter((tz) => !(tz in TZ_CITY_RF));
    expect(outside).toEqual([]);
  });

  it("зоны РФ — замороженный список: новая зона в блоке РФ требует решения человека", () => {
    expect(RF_ADMIN_TIMEZONES).toEqual([
      "Europe/Kaliningrad",
      "Europe/Moscow",
      "Europe/Simferopol",
      "Europe/Volgograd",
      "Europe/Kirov",
      "Europe/Astrakhan",
      "Europe/Saratov",
      "Europe/Ulyanovsk",
      "Europe/Samara",
      "Asia/Yekaterinburg",
      "Asia/Omsk",
      "Asia/Novosibirsk",
      "Asia/Barnaul",
      "Asia/Tomsk",
      "Asia/Krasnoyarsk",
      "Asia/Novokuznetsk",
      "Asia/Irkutsk",
      "Asia/Chita",
      "Asia/Yakutsk",
      "Asia/Vladivostok",
      "Asia/Khandyga",
      "Asia/Sakhalin",
      "Asia/Magadan",
      "Asia/Srednekolymsk",
      "Asia/Ust-Nera",
      "Asia/Kamchatka",
      "Asia/Anadyr",
    ]);
  });

  it("каждая зона списков — настоящая IANA-зона", () => {
    for (const tz of [...RF_PICKER_TIMEZONES, ...RF_ADMIN_TIMEZONES]) expect(isValidTimeZone(tz), tz).toBe(true);
  });

  it("кабинет — по одной зоне на смещение, запад → восток, без СНГ", () => {
    expect(RF_PICKER_TIMEZONES).toHaveLength(12);
    expect(TIMEZONE_OPTIONS.some((option) => option.value === "Asia/Almaty")).toBe(false);
    const moscow = TIMEZONE_OPTIONS.find((option) => option.value === "Europe/Moscow");
    expect(moscow?.label).toBe("Москва (Europe/Moscow)");
  });
});

describe("словарь подписей не тронут", () => {
  it("зоны СНГ по-прежнему подписываются городом", () => {
    expect(TZ_CITY_RU["Asia/Almaty"]).toBe("Алматы");
    expect(TZ_CITY_RU["Europe/Minsk"]).toBe("Минск");
    expect(TZ_CITY_RU["Europe/Moscow"]).toBe("Москва");
  });
});

describe("buildTimezoneOptions", () => {
  it("текущая зона из списка — список без изменений", () => {
    expect(buildTimezoneOptions("Europe/Moscow")).toEqual(TIMEZONE_OPTIONS);
  });

  it("пустое значение — список без изменений", () => {
    expect(buildTimezoneOptions(null)).toEqual(TIMEZONE_OPTIONS);
    expect(buildTimezoneOptions("   ")).toEqual(TIMEZONE_OPTIONS);
  });

  it("текущая зона СНГ показывается первой с подписью — сохранённое значение не теряется (28.4)", () => {
    const options = buildTimezoneOptions("Asia/Almaty");
    expect(options[0]).toEqual({ value: "Asia/Almaty", label: "Алматы (Asia/Almaty)" });
    expect(options).toHaveLength(TIMEZONE_OPTIONS.length + 1);
  });

  it("админка: полный список РФ; зона РФ вне короткого списка — не дублируется", () => {
    const options = buildTimezoneOptions("Asia/Novokuznetsk", RF_ADMIN_TIMEZONES);
    expect(options).toHaveLength(RF_ADMIN_TIMEZONES.length);
    expect(options.find((option) => option.value === "Asia/Novokuznetsk")?.label).toBe(
      "Новокузнецк (Asia/Novokuznetsk)",
    );
  });

  it("незнакомая зона — сырым id", () => {
    expect(buildTimezoneOptions("Pacific/Auckland")[0]).toEqual({ value: "Pacific/Auckland", label: "Pacific/Auckland" });
  });
});

describe("isSelectableTimeZone — серверная проверка (28.3)", () => {
  it("зона России — да, любая из полного списка", () => {
    expect(isSelectableTimeZone("Europe/Moscow", null)).toBe(true);
    expect(isSelectableTimeZone("Asia/Novokuznetsk", "Europe/Moscow")).toBe(true);
  });

  it("новая зона СНГ — нет", () => {
    expect(isSelectableTimeZone("Asia/Almaty", "Europe/Moscow")).toBe(false);
    expect(isSelectableTimeZone("Asia/Almaty", null)).toBe(false);
  });

  it("текущая зона СНГ без изменений — да: сохранение других полей не падает", () => {
    expect(isSelectableTimeZone("Asia/Almaty", "Asia/Almaty")).toBe(true);
    expect(isSelectableTimeZone(" Asia/Almaty ", "Asia/Almaty")).toBe(true);
  });
});
