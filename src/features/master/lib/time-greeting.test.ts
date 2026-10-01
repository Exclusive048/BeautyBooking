import { describe, expect, it } from "vitest";
import { formatHeroDate, getTimeGreeting } from "@/features/master/lib/time-greeting";

/**
 * 29.09 доработки · 24 — герой главной кабинета мастера рендерится на СЕРВЕРЕ:
 * `getHours()` / `getDate()` читали часы контейнера, а не мастера. Якорь —
 * Екатеринбург (+5): на Москве (+3) ошибка с UTC-контейнером тоже видна, но
 * расхождение двух поясов доказывает, что пояс действительно применяется.
 */
describe("приветствие и дата героя — в поясе кабинета", () => {
  // 08:30Z — 11:30 в Москве, 13:30 в Екатеринбурге.
  const MORNING_IN_MOSCOW = new Date("2026-10-01T08:30:00.000Z");
  // 20:30Z 30 сентября — 23:30 среды в Москве, 01:30 четверга в Екатеринбурге.
  const MIDNIGHT_EDGE = new Date("2026-09-30T20:30:00.000Z");

  it("час берётся из пояса мастера", () => {
    expect(getTimeGreeting(MORNING_IN_MOSCOW, "Europe/Moscow")).toBe("Доброе утро");
    expect(getTimeGreeting(MORNING_IN_MOSCOW, "Asia/Yekaterinburg")).toBe("Добрый день");
  });

  it("дата и день недели — тоже из пояса мастера", () => {
    expect(formatHeroDate(MIDNIGHT_EDGE, "Europe/Moscow")).toBe("среда, 30 сентября");
    expect(formatHeroDate(MIDNIGHT_EDGE, "Asia/Yekaterinburg")).toBe("четверг, 1 октября");
  });
});
