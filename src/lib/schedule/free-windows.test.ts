import { describe, expect, it } from "vitest";
import {
  computeFreeWindows,
  freeWindowsCount,
  freeWindowsMinutes,
  mergeRanges,
  minuteLabel,
  nowMinuteForDay,
} from "./free-windows";

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

const base = {
  isWorking: true,
  workingIntervals: [{ startMin: h(9), endMin: h(18) }],
  breaks: [] as Array<{ startMin: number; endMin: number }>,
  fixedStarts: null,
  bookings: [] as Array<{ startMin: number; endMin: number }>,
  blocks: [] as Array<{ startMin: number; endMin: number }>,
  bufferMin: 0,
  minDurationMin: 30,
  nowMinute: null,
};

describe("computeFreeWindows", () => {
  it("пустой рабочий день — один промежуток во все рабочие часы", () => {
    expect(computeFreeWindows(base).windows).toEqual([{ startMin: h(9), endMin: h(18) }]);
  });

  it("записи, перерыв и блокировка режут день; пауза мастера — вокруг записи, не вокруг перерыва", () => {
    const day = computeFreeWindows({
      ...base,
      bookings: [{ startMin: h(10), endMin: h(11) }],
      breaks: [{ startMin: h(13), endMin: h(14) }],
      blocks: [{ startMin: h(16), endMin: h(17) }],
      bufferMin: 10,
    });
    expect(day.windows).toEqual([
      { startMin: h(9), endMin: h(9, 50) },
      { startMin: h(11, 10), endMin: h(13) },
      { startMin: h(14), endMin: h(16) },
      { startMin: h(17), endMin: h(18) },
    ]);
    expect(freeWindowsMinutes(day)).toBe(50 + 110 + 120 + 60);
    expect(freeWindowsCount(day)).toBe(4);
  });

  it("промежуток короче самой короткой услуги не показывается", () => {
    const day = computeFreeWindows({
      ...base,
      bookings: [
        { startMin: h(9), endMin: h(10) },
        { startMin: h(10, 20), endMin: h(18) },
      ],
      minDurationMin: 30,
    });
    expect(day.windows).toEqual([]);
  });

  it("сегодня время до «сейчас» не предлагается", () => {
    const day = computeFreeWindows({ ...base, nowMinute: h(12, 15) });
    expect(day.windows).toEqual([{ startMin: h(12, 15), endMin: h(18) }]);
  });

  it("прошедший день — ничего", () => {
    expect(computeFreeWindows({ ...base, nowMinute: 24 * 60 }).windows).toEqual([]);
  });

  it("выходной — ничего", () => {
    expect(computeFreeWindows({ ...base, isWorking: false }).windows).toEqual([]);
  });

  it("запись через полночь салона занимает день до конца суток", () => {
    const day = computeFreeWindows({
      ...base,
      workingIntervals: [{ startMin: h(20), endMin: h(23, 55) }],
      bookings: [{ startMin: h(22), endMin: h(0, 30) }],
    });
    expect(day.windows).toEqual([{ startMin: h(20), endMin: h(22) }]);
  });

  it("день «Фиксированное время» — свободные начала, а не промежутки", () => {
    const day = computeFreeWindows({
      ...base,
      workingIntervals: [{ startMin: 0, endMin: h(23, 55) }],
      fixedStarts: ["10:00", "12:00", "15:00", "17:30"],
      bookings: [{ startMin: h(12), endMin: h(13) }],
      blocks: [{ startMin: h(17), endMin: h(18) }],
      minDurationMin: 60,
      nowMinute: h(9),
    });
    expect(day.windows).toEqual([]);
    expect(day.freeStarts).toEqual([h(10), h(15)]);
    expect(freeWindowsCount(day)).toBe(2);
  });
});

describe("служебные функции", () => {
  it("mergeRanges склеивает касающиеся и вложенные отрезки", () => {
    expect(
      mergeRanges([
        { startMin: 60, endMin: 120 },
        { startMin: 0, endMin: 60 },
        { startMin: 90, endMin: 100 },
        { startMin: 200, endMin: 210 },
      ]),
    ).toEqual([
      { startMin: 0, endMin: 120 },
      { startMin: 200, endMin: 210 },
    ]);
  });

  it("minuteLabel — часы и минуты салона, конец суток — 24:00", () => {
    expect(minuteLabel(h(7))).toBe("07:00");
    expect(minuteLabel(h(13, 5))).toBe("13:05");
    expect(minuteLabel(24 * 60)).toBe("24:00");
  });

  it("nowMinuteForDay различает прошлое, сегодня и будущее", () => {
    expect(nowMinuteForDay("2026-10-29", "2026-10-30", 600)).toBe(24 * 60);
    expect(nowMinuteForDay("2026-10-30", "2026-10-30", 600)).toBe(600);
    expect(nowMinuteForDay("2026-10-31", "2026-10-30", 600)).toBeNull();
  });
});
