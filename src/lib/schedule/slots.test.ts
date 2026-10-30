import { describe, it, expect } from "vitest";
import { buildSlotsForDay } from "@/lib/schedule/slots";
import type { DayPlan } from "@/lib/schedule/types";

describe("schedule/slots", () => {
  const basePlan = {
    isWorking: true,
    workingIntervals: [{ start: "10:00", end: "12:00" }],
    breaks: [],
    meta: { source: "weekly-template" as const },
  };

  it("generates slots within working interval", () => {
    const slots = buildSlotsForDay({
      dayPlan: basePlan,
      dateKey: "2026-03-03",
      timeZone: "UTC",
      serviceDurationMin: 30,
      bufferMin: 0,
      bookings: [],
      now: new Date("2026-03-03T08:00:00Z"),
    });

    expect(slots[0]?.label).toBe("2026-03-03 10:00");
    expect(slots[slots.length - 1]?.label).toBe("2026-03-03 11:30");
    expect(slots).toHaveLength(4);
  });

  it("skips slots overlapping breaks", () => {
    const slots = buildSlotsForDay({
      dayPlan: {
        ...basePlan,
        breaks: [{ start: "10:30", end: "10:45" }],
      },
      dateKey: "2026-03-03",
      timeZone: "UTC",
      serviceDurationMin: 30,
      bufferMin: 0,
      bookings: [],
      now: new Date("2026-03-03T08:00:00Z"),
    });

    const labels = slots.map((slot) => slot.label);
    expect(labels).not.toContain("2026-03-03 10:30");
  });

  it("skips slots conflicting with bookings", () => {
    const slots = buildSlotsForDay({
      dayPlan: basePlan,
      dateKey: "2026-03-03",
      timeZone: "UTC",
      serviceDurationMin: 30,
      bufferMin: 0,
      bookings: [
        {
          startAtUtc: new Date("2026-03-03T10:00:00Z"),
          endAtUtc: new Date("2026-03-03T11:00:00Z"),
        },
      ],
      now: new Date("2026-03-03T08:00:00Z"),
    });

    expect(slots[0]?.label).toBe("2026-03-03 11:00");
  });

  // FIX-TIMEBLOCK-ENFORCEMENT-01: a TimeBlock window is removed from
  // availability. Instant-based UTC overlap, no buffer (hard window) — the slots
  // immediately before and after the block are still offered.
  it("skips slots overlapping a TimeBlock but keeps the ones abutting it", () => {
    const slots = buildSlotsForDay({
      dayPlan: basePlan,
      dateKey: "2026-03-03",
      timeZone: "UTC",
      serviceDurationMin: 30,
      bufferMin: 0,
      bookings: [],
      blocks: [
        {
          startAtUtc: new Date("2026-03-03T10:30:00Z"),
          endAtUtc: new Date("2026-03-03T11:00:00Z"),
        },
      ],
      now: new Date("2026-03-03T08:00:00Z"),
    });

    const labels = slots.map((slot) => slot.label.slice(-5));
    // 10:30 overlaps the block → gone; 10:00 (ends 10:30) and 11:00 (starts at
    // the block end) abut it → kept — a block is a hard window, not buffered.
    expect(labels).toEqual(["10:00", "11:00", "11:30"]);
  });

  it("blocks the whole day when the TimeBlock covers the working interval", () => {
    const slots = buildSlotsForDay({
      dayPlan: basePlan,
      dateKey: "2026-03-03",
      timeZone: "UTC",
      serviceDurationMin: 30,
      bufferMin: 0,
      bookings: [],
      blocks: [
        {
          startAtUtc: new Date("2026-03-03T09:00:00Z"),
          endAtUtc: new Date("2026-03-03T13:00:00Z"),
        },
      ],
      now: new Date("2026-03-03T08:00:00Z"),
    });

    expect(slots).toEqual([]);
  });

  // FIX-05 (QA-111): the grid step must honour the master's slotStepMin.
  it("honours slotStepMin=15 (15-min grid), default 30 when omitted", () => {
    const args = {
      dayPlan: basePlan,
      dateKey: "2026-03-03",
      timeZone: "UTC",
      serviceDurationMin: 30,
      bufferMin: 0,
      bookings: [],
      now: new Date("2026-03-03T08:00:00Z"),
    };

    const fine = buildSlotsForDay({ ...args, slotStepMin: 15 }).map((s) => s.label.slice(-5));
    // 10:00..11:30 start window (service 30m, interval ends 12:00) at 15-min step.
    expect(fine).toEqual(["10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30"]);

    const coarse = buildSlotsForDay({ ...args, slotStepMin: 60 }).map((s) => s.label.slice(-5));
    // SLOTS-FLUSH-STARTS: 11:30 — начало «впритык» к концу рабочего отрезка
    // (услуга кончается ровно в 12:00), сетка шага 60 его не даёт.
    expect(coarse).toEqual(["10:00", "11:00", "11:30"]);

    // Omitting slotStepMin falls back to the legacy 30-min step.
    const fallback = buildSlotsForDay(args).map((s) => s.label.slice(-5));
    expect(fallback).toEqual(["10:00", "10:30", "11:00", "11:30"]);
  });

  it("returns no slots for past dateKey", () => {
    const slots = buildSlotsForDay({
      dayPlan: basePlan,
      dateKey: "2026-03-03",
      timeZone: "UTC",
      serviceDurationMin: 30,
      bufferMin: 0,
      bookings: [],
      now: new Date("2026-03-03T13:00:00Z"),
    });

    expect(slots).toEqual([]);
  });
});

// SLOTS-FLUSH-STARTS (2026-10-29, запрос мастера): к сетке шага добавляются
// начала вплотную после и до занятого времени, чтобы короткая услуга при
// мелком шаге не теряла время между записями.
describe("schedule/slots — начала «впритык»", () => {
  const day = (start: string, end: string, extra: Partial<DayPlan> = {}): DayPlan => ({
    isWorking: true,
    workingIntervals: [{ start, end }],
    breaks: [],
    meta: { source: "weekly-template" as const },
    ...extra,
  });
  const at = (hm: string, dateKey = "2026-03-03") => new Date(`${dateKey}T${hm}:00Z`);
  const booking = (from: string, to: string) => ({ startAtUtc: at(from), endAtUtc: at(to) });
  const times = (slots: Array<{ label: string }>) => slots.map((slot) => slot.label.slice(-5));
  const base = {
    dateKey: "2026-03-03",
    timeZone: "UTC",
    serviceDurationMin: 20,
    bufferMin: 0,
    slotStepMin: 15,
    now: new Date("2026-03-03T05:00:00Z"),
  };

  it("предлагает время сразу после записи: 20 минут при шаге 15, запись на 7:00 → 7:20", () => {
    const labels = times(
      buildSlotsForDay({ ...base, dayPlan: day("07:00", "09:00"), bookings: [booking("07:00", "07:20")] }),
    );
    expect(labels.slice(0, 3)).toEqual(["07:20", "07:30", "07:45"]);
    expect(labels).not.toContain("07:15");
  });

  it("три записи по 20 минут укладываются в час", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        dayPlan: day("07:00", "09:00"),
        bookings: [booking("07:00", "07:20"), booking("07:20", "07:40")],
      }),
    );
    // Третья запись начинается в 7:40 и кончается в 8:00.
    expect(labels[0]).toBe("07:40");
  });

  it("учитывает паузу между записями", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        bufferMin: 5,
        dayPlan: day("10:00", "12:00"),
        bookings: [booking("10:00", "10:20"), booking("11:00", "11:20")],
      }),
    );
    // После 10:20 — пауза 5 минут; до 11:00 — услуга кончается за 5 минут.
    expect(labels).toContain("10:25");
    expect(labels).toContain("10:35");
    expect(labels).not.toContain("10:20");
    expect(labels).not.toContain("10:40");
    // После второй записи — 11:25 (+ пауза).
    expect(labels).toContain("11:25");
  });

  it("предлагает время вплотную до записи", () => {
    const labels = times(
      buildSlotsForDay({ ...base, dayPlan: day("10:00", "12:00"), bookings: [booking("11:00", "12:00")] }),
    );
    // 10:40–11:00 — ровно до записи; 10:45 залезает на неё.
    expect(labels).toEqual(["10:00", "10:15", "10:30", "10:40"]);
  });

  it("считает от перерыва и блокировки времени, а не от сетки", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        serviceDurationMin: 30,
        slotStepMin: 30,
        dayPlan: day("10:00", "13:00", { breaks: [{ start: "10:40", end: "10:50" }] }),
        bookings: [],
        blocks: [booking("11:30", "11:55")],
      }),
    );
    // 10:10 — кончается к перерыву, 10:50 — сразу после него, 11:00 — до
    // блокировки, 11:55 — после неё, 12:30 — к концу дня.
    expect(labels).toEqual(["10:00", "10:10", "10:50", "11:00", "11:55", "12:00", "12:30"]);
  });

  it("на пустом отрезке остаётся сетка и одно время к концу дня", () => {
    const labels = times(
      buildSlotsForDay({ ...base, slotStepMin: 30, dayPlan: day("10:00", "12:00"), bookings: [] }),
    );
    expect(labels).toEqual(["10:00", "10:30", "11:00", "11:30", "11:40"]);
  });

  it("не трогает день «Фиксированное время»", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        dayPlan: day("10:00", "12:00", { fixedStarts: ["10:00", "11:00"] }),
        bookings: [booking("10:00", "10:20")],
        extraStartsUtc: [at("10:20")],
      }),
    );
    expect(labels).toEqual(["11:00"]);
  });

  it("сегодня не предлагает начало, которое уже прошло", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        dayPlan: day("09:00", "12:00"),
        bookings: [booking("09:30", "10:02"), booking("10:10", "10:30")],
        now: new Date("2026-03-03T10:05:00Z"),
      }),
    );
    // 10:02 (после первой записи) уже прошло; 10:15 по сетке задевает вторую.
    expect(labels).not.toContain("10:02");
    expect(labels[0]).toBe("10:30");
  });

  it("предлагает переданные начала, если они свободны и в этот день", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        dayPlan: day("10:00", "12:00"),
        bookings: [booking("11:00", "11:20")],
        extraStartsUtc: [at("10:25"), at("10:50"), at("10:25", "2026-03-04")],
      }),
    );
    expect(labels).toContain("10:25");
    // 10:50–11:10 пересекает запись — отброшено обычной проверкой.
    expect(labels).not.toContain("10:50");
    expect(labels.filter((label) => label === "10:25")).toHaveLength(1);
  });

  it("работает и при большом числе записей (слитые отрезки)", () => {
    const bookings = Array.from({ length: 11 }, (_, index) => {
      const start = 7 * 60 + index * 20;
      const end = start + 20;
      const hm = (minutes: number) =>
        `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      return booking(hm(start), hm(end));
    });
    const labels = times(buildSlotsForDay({ ...base, dayPlan: day("07:00", "12:00"), bookings }));
    // 11 записей по 20 минут с 7:00 — следующее время 10:40.
    expect(labels[0]).toBe("10:40");
    expect(labels).not.toContain("10:30");
  });

  // Тестовый якорь пояса: салон в Екатеринбурге (GMT+5), запись 08:00Z–08:20Z
  // = 13:00–13:20 по салону. Начало после неё — 13:20 салона = 08:20Z.
  it("считает в поясе салона (Екатеринбург)", () => {
    const slots = buildSlotsForDay({
      ...base,
      timeZone: "Asia/Yekaterinburg",
      dayPlan: day("12:00", "15:00"),
      bookings: [{ startAtUtc: at("08:00"), endAtUtc: at("08:20") }],
      now: new Date("2026-03-03T02:00:00Z"),
    });
    const after = slots.find((slot) => slot.label === "2026-03-03 13:20");
    expect(after?.startAtUtc.toISOString()).toBe("2026-03-03T08:20:00.000Z");
    expect(times(slots)).not.toContain("13:15");
  });
});

describe("schedule/slots — окошки без дыр (SLOTS-GAP-PACKING)", () => {
  const day = (start: string, end: string, extra: Partial<DayPlan> = {}): DayPlan => ({
    isWorking: true,
    workingIntervals: [{ start, end }],
    breaks: [],
    meta: { source: "weekly-template" as const },
    ...extra,
  });
  const at = (hm: string) => new Date(`2026-03-03T${hm}:00Z`);
  const booking = (from: string, to: string) => ({ startAtUtc: at(from), endAtUtc: at(to) });
  const times = (slots: Array<{ label: string }>) => slots.map((slot) => slot.label.slice(-5));
  const base = {
    dateKey: "2026-03-03",
    timeZone: "UTC",
    serviceDurationMin: 20,
    bufferMin: 0,
    slotStepMin: 15,
    now: new Date("2026-03-02T05:00:00Z"),
    packingDurationsMin: [20],
  };

  // Сценарий владельца: запись 6:10–6:30, услуга 20 минут, шаг 15. Раньше
  // предлагались 6:30, 6:45, 7:00: клиент, бравший 6:45, оставлял 15 минут,
  // куда не встаёт ни одна запись.
  it("не предлагает 6:45 после записи 6:10–6:30 и предлагает 6:50", () => {
    const labels = times(
      buildSlotsForDay({ ...base, dayPlan: day("06:00", "21:00"), bookings: [booking("06:10", "06:30")] }),
    );
    expect(labels.filter((label) => label <= "07:30")).toEqual(["06:30", "06:50", "07:10", "07:30"]);
  });

  // MANUAL-SLOTS-ALL: «все свободные времена» ручной записи — без отбора, но с
  // началами «подряд». Иначе оператор, открыв их, не увидел бы 6:50, которое
  // предлагается клиенту: сетка шага 15 его не содержит.
  //
  // @probe 2026-10-30 — в `buildSlotsForDay` условие начал «подряд» сужено
  // обратно до `packingTable ?`: красный этот кейс (нет 06:50 и 07:10).
  // Возвращено — зелёный.
  it("«все времена» (chainStarts без набора услуг) — сетка и начала подряд, без отбора", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        packingDurationsMin: undefined,
        chainStarts: true,
        dayPlan: day("06:00", "21:00"),
        bookings: [booking("06:10", "06:30")],
      }),
    );
    expect(labels.filter((label) => label <= "07:15")).toEqual([
      "06:30",
      "06:45",
      "06:50",
      "07:00",
      "07:10",
      "07:15",
    ]);
  });

  it("без набора услуг — прежние окошки (пробы «свободно сегодня» и «когда»)", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        packingDurationsMin: undefined,
        dayPlan: day("06:00", "21:00"),
        bookings: [booking("06:10", "06:30")],
      }),
    );
    expect(labels.filter((label) => label <= "07:00")).toEqual(["06:30", "06:45", "07:00"]);
  });

  // Простое «не оставлять промежуток короче услуги» здесь отказало бы: после
  // 20 минут останется 5. Остаток неизбежен — он уходит к концу промежутка.
  it("ставит 20 минут в промежуток 25 — вплотную к записи до него", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        dayPlan: day("10:00", "12:00"),
        bookings: [booking("10:00", "10:20"), booking("10:45", "11:05")],
      }),
    );
    expect(labels).toContain("10:20");
    expect(labels).not.toContain("10:25");
  });

  it("учитывает паузу мастера между записями", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        bufferMin: 5,
        dayPlan: day("10:00", "12:00"),
        bookings: [booking("10:00", "10:20")],
      }),
    );
    // Запись с паузой занимает 25 минут: 10:25, 10:50, 11:15, 11:40.
    expect(labels).toEqual(["10:25", "10:50", "11:15", "11:40"]);
  });

  it("считает промежуток всеми услугами профиля, а не только выбранной", () => {
    const only30 = times(
      buildSlotsForDay({ ...base, serviceDurationMin: 30, packingDurationsMin: [30], dayPlan: day("10:00", "12:00"), bookings: [] }),
    );
    const with45 = times(
      buildSlotsForDay({ ...base, serviceDurationMin: 30, packingDurationsMin: [30, 45], dayPlan: day("10:00", "12:00"), bookings: [] }),
    );
    // До 10:45 — 45 минут: одной услугой на 30 не заполнить, услугой на 45 — да.
    expect(only30).not.toContain("10:45");
    expect(with45).toContain("10:45");
  });

  // Цена правила, принятая сознательно: промежуток 90 минут при услугах 20 и
  // 45 целиком заполняют только две по 45 — короткая его бы испортила.
  it("бережёт промежуток под услуги, которые заполняют его целиком", () => {
    const short = times(
      buildSlotsForDay({ ...base, packingDurationsMin: [20, 45], dayPlan: day("10:00", "11:30"), bookings: [] }),
    );
    const long = times(
      buildSlotsForDay({
        ...base,
        serviceDurationMin: 45,
        packingDurationsMin: [20, 45],
        dayPlan: day("10:00", "11:30"),
        bookings: [],
      }),
    );
    expect(short).toEqual([]);
    expect(long).toEqual(["10:00", "10:45"]);
  });

  it("сегодня не считает дырой время до «сейчас»", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        dayPlan: day("09:00", "12:00"),
        bookings: [],
        now: new Date("2026-03-03T10:07:00Z"),
      }),
    );
    // От 9:00 до 10:15 — 75 минут, но продать их уже нельзя: 10:15 годится.
    expect(labels[0]).toBe("10:15");
  });

  it("переданные начала (курсор пакета) отбор не проходят", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        dayPlan: day("10:00", "12:00"),
        bookings: [booking("10:00", "10:20")],
        extraStartsUtc: [at("10:35")],
      }),
    );
    expect(labels).toContain("10:35");
    expect(labels).not.toContain("10:30");
  });

  it("не трогает день «Фиксированное время»", () => {
    const labels = times(
      buildSlotsForDay({
        ...base,
        dayPlan: day("10:00", "12:00", { fixedStarts: ["10:00", "10:35", "11:00"] }),
        bookings: [],
      }),
    );
    expect(labels).toEqual(["10:00", "10:35", "11:00"]);
  });
});
