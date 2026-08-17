import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildDateBounds,
  buildDayOptions,
  todayKey,
} from "@/features/booking/lib/studio-booking";

/**
 * LOGIC-26 — день по умолчанию в booking-визардах строился host-локальными
 * геттерами (`getFullYear`/`getMonth`/`getDate`), то есть по часам ПОСЕТИТЕЛЯ.
 * Клиент из Калининграда (+2), открывающий екатеринбургскую студию (+5) поздно
 * вечером, получал выдачу слотов на вчерашний по меркам салона день: виджет
 * открывался не на том дне, и часть сегодняшних слотов была невидима.
 *
 * Якорь — Vision / Екатеринбург, GMT+5 (§5 скилла timezone-correctness).
 * Проверять такую поверхность на Москве бессмысленно: там зритель совпадает с
 * салоном, и ошибка невидима.
 */

const KALININGRAD = "Europe/Kaliningrad"; // +2
const YEKATERINBURG = "Asia/Yekaterinburg"; // +5
const MOSCOW = "Europe/Moscow"; // +3

afterEach(() => {
  vi.useRealTimers();
});

/** 2026-08-12T20:30Z: в Калининграде ещё 12-е, в Екатеринбурге уже 13-е. */
function atLateEvening() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-12T20:30:00.000Z"));
}

describe("todayKey — LOGIC-26", () => {
  it("возвращает сегодня САЛОНА, а не посетителя", () => {
    atLateEvening();
    expect(todayKey(YEKATERINBURG)).toBe("2026-08-13");
    expect(todayKey(KALININGRAD)).toBe("2026-08-12");
    expect(todayKey(MOSCOW)).toBe("2026-08-12");
  });
});

describe("buildDayOptions — LOGIC-26", () => {
  it("первый день — сегодня салона, дальше по одному салонному дню", () => {
    atLateEvening();
    const days = buildDayOptions(3, YEKATERINBURG);
    expect(days.map((d) => d.key)).toEqual(["2026-08-13", "2026-08-14", "2026-08-15"]);
  });

  it("подпись дня соответствует его же ключу, а не соседним суткам", () => {
    atLateEvening();
    const [first] = buildDayOptions(1, YEKATERINBURG);
    // 13 августа 2026 — четверг.
    expect(first!.label).toContain("13");
    expect(first!.label).toContain("авг");
  });
});

describe("buildDateBounds — LOGIC-26", () => {
  it("нижняя граница — сегодня салона, верхняя — сдвиг по датам, не по часам", () => {
    atLateEvening();
    expect(buildDateBounds(new Date(), YEKATERINBURG, 60)).toEqual({
      min: "2026-08-13",
      max: "2026-10-12",
    });
  });
});

describe("host-локальных построителей дней не осталось (LOGIC-26)", () => {
  const SURFACES = [
    "src/features/booking/lib/studio-booking.ts",
    "src/features/public-studio/studio-booking-flow/components/steps/when-step.tsx",
    "src/features/public-studio/components/studio-package-flow.tsx",
  ];

  for (const file of SURFACES) {
    it(`${file} не собирает дату из host-геттеров`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      // Именно эта тройка и давала «сегодня» посетителя.
      expect(source).not.toMatch(/\.getFullYear\(\)/);
      expect(source).not.toMatch(/\.getMonth\(\)/);
      expect(source).not.toMatch(/\.getDate\(\)/);
    });
  }
});
