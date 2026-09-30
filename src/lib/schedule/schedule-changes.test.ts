import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCHEDULE-STUDIO-PROFILE-CALENDAR — заявка мастера на расписание в студии, в
 * которой правки КОПЯТСЯ (`CHANGES_V1`): слияние правок, перенос открытых
 * заявок старых форматов без потери содержимого, отзыв опустевшей заявки,
 * одобрение одной транзакцией и «было → стало» для карточки студии.
 *
 * @probe 2026-09-28 — в `mergeScheduleChange` условие «как по графику на дате
 * без своей правки — не изменение» заменено на безусловную запись действия:
 * покраснели «reset без правки в расписании — не изменение» (в заявке осталась
 * дата `{kind:"reset"}`) и «правка свелась к нулю — заявка отозвана» (без
 * открытой заявки ответ `created` вместо `unchanged` — студии ушла бы пустая
 * по смыслу заявка). Возвращено — зелёные.
 * @probe 2026-09-28 — в `applyScheduleChangesRequest` снят фильтр прошедших
 * дат: покраснел «прошедшие дни пропускаются» (в покраску ушла вчерашняя дата).
 */

const state = vi.hoisted(() => ({
  pending: null as null | { id: string; payloadJson: unknown },
  overrides: [] as string[],
  templates: new Set<string>(),
  created: [] as unknown[],
  updated: [] as unknown[],
  deleted: [] as string[],
  exceptions: [] as Array<Record<string, unknown>>,
  currentWeek: [] as unknown[],
}));
const spies = vi.hoisted(() => ({
  paint: [] as Array<{ dates: string[]; action: unknown }>,
  week: [] as unknown[],
  pattern: [] as unknown[],
  notified: 0,
  invalidated: 0,
}));

vi.mock("@/lib/prisma", () => {
  const client = {
    provider: { findUnique: async () => ({ timezone: "Europe/Moscow" }) },
    studio: { findUnique: async () => ({ id: "studio-1" }) },
    scheduleChangeRequest: {
      findFirst: async () => state.pending,
      create: async (input: { data: unknown }) => {
        state.created.push(input.data);
        return { id: "req-new" };
      },
      update: async (input: { data: unknown }) => {
        state.updated.push(input.data);
        return {};
      },
      delete: async (input: { where: { id: string } }) => {
        state.deleted.push(input.where.id);
        return {};
      },
    },
    scheduleOverride: {
      findMany: async (input: { where: { date: { in: Date[] } } }) =>
        input.where.date.in
          .map((date) => date.toISOString().slice(0, 10))
          .filter((key) => state.overrides.includes(key))
          .map((key) => ({ date: new Date(`${key}T00:00:00.000Z`) })),
    },
    scheduleTemplate: {
      count: async (input: { where: { id: string } }) => (state.templates.has(input.where.id) ? 1 : 0),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return { prisma: client };
});
vi.mock("@/lib/notifications/studio-notifications", () => ({
  loadScheduleRequestWithRelations: async () => ({ id: "req-new" }),
  notifyScheduleRequestSubmitted: async () => {
    spies.notified += 1;
  },
}));
vi.mock("@/lib/schedule/slotsCache", () => ({
  invalidateSlotsForMaster: async () => {
    spies.invalidated += 1;
  },
}));
vi.mock("@/lib/schedule/editor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedule/editor")>()),
  readScheduleExceptionsTx: async () => state.exceptions,
}));
vi.mock("@/lib/schedule/calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedule/calendar")>()),
  paintScheduleDaysTx: async (_tx: unknown, _providerId: string, dates: string[], action: unknown) => {
    spies.paint.push({ dates, action });
  },
}));
vi.mock("@/lib/schedule/patterns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedule/patterns")>()),
  readWeekRepresentation: async () => ({ state: "pattern", week: state.currentWeek }),
  saveWeekAsPatternTx: async (_tx: unknown, _providerId: string, week: unknown) => {
    spies.week.push(week);
  },
  loadSchedulePlan: async () => ({
    todayKey: "2026-10-05",
    current: null,
    templates: [
      {
        id: "tpl-morning",
        name: "Утро",
        color: "1",
        startTime: "09:00",
        endTime: "15:00",
        breaks: [],
        scheduleMode: "FLEXIBLE",
        fixedSlotTimes: [],
        inPalette: true,
        inUse: true,
      },
    ],
  }),
}));
vi.mock("@/lib/schedule/pattern-apply", () => ({
  patternRequestForApproval: (raw: unknown) => raw,
  applyPatternRequestTx: async (_tx: unknown, _providerId: string, request: unknown) => {
    spies.pattern.push(request);
  },
}));
vi.mock("@/lib/schedule/day-plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedule/day-plans")>()),
  loadDayPlans: async () =>
    new Map([
      [
        "prov-1",
        new Map([
          [
            "2026-10-07",
            {
              isWorking: true,
              workingIntervals: [{ start: "10:00", end: "19:00" }],
              breaks: [],
              meta: { source: "pattern" },
            },
          ],
        ]),
      ],
    ]),
}));

import {
  applyScheduleChangesRequest,
  buildScheduleRequestReview,
  exceptionsToDayChanges,
  submitStudioScheduleChange,
  toScheduleChangesPayload,
} from "@/lib/schedule/change-requests";
import { prisma } from "@/lib/prisma";
import { PATTERN_CHANGE_REQUEST_FORMAT, type PatternChangeRequestBody } from "@/lib/schedule/patterns-shared";
import {
  SCHEDULE_CHANGES_FORMAT,
  emptyScheduleChanges,
  isEmptyScheduleChanges,
  mergeScheduleChange,
  type ScheduleChangesPayload,
} from "@/lib/schedule/schedule-changes-shared";
import type { DayScheduleDto } from "@/lib/schedule/editor-shared";
import {
  buildReviewPreview,
  buildSchedulePayloadPreview,
} from "@/features/studio-cabinet/schedule-requests/lib/payload-display";

const NOW = new Date("2026-10-05T09:00:00.000Z"); // Москва: 5 октября
const NONE = { overriddenDates: new Set<string>() };

const WEEK: DayScheduleDto[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  isWorkday: dayOfWeek < 5,
  scheduleMode: "FLEXIBLE",
  startTime: "10:00",
  endTime: "19:00",
  breaks: [],
  fixedSlotTimes: [],
}));

const PATTERN: PatternChangeRequestBody = {
  templates: [{ startTime: "10:00", endTime: "19:00", breaks: [], scheduleMode: "FLEXIBLE", fixedSlotTimes: [] }],
  pattern: {
    kind: "CYCLE",
    cycleDays: 4,
    anchorOn: "2026-10-05",
    startsOn: "2026-10-05",
    endsOn: "2026-12-31",
    days: [0, 0, null, null],
    resumePrevious: false,
  },
} as PatternChangeRequestBody;

function request(input: Partial<ScheduleChangesPayload>): { id: string; payloadJson: ScheduleChangesPayload } {
  return { id: "req-1", payloadJson: { ...emptyScheduleChanges(), ...input } };
}

function submit(change: Parameters<typeof submitStudioScheduleChange>[0]["change"]) {
  return submitStudioScheduleChange({
    req: new Request("http://localhost/api"),
    route: "PUT /test",
    providerId: "prov-1",
    studioProviderId: "studio-prov",
    change,
    now: NOW,
  });
}

beforeEach(() => {
  state.pending = null;
  state.overrides = [];
  state.templates = new Set(["tpl-morning"]);
  state.created = [];
  state.updated = [];
  state.deleted = [];
  state.exceptions = [];
  state.currentWeek = WEEK.map((day) => ({ ...day, isWorkday: false }));
  spies.paint = [];
  spies.week = [];
  spies.pattern = [];
  spies.notified = 0;
  spies.invalidated = 0;
});

describe("слияние правок заявки", () => {
  it("неделя и график вытесняют друг друга — действует последнее", () => {
    const withWeek = mergeScheduleChange(emptyScheduleChanges(), { kind: "week", week: WEEK }, NONE);
    const withPattern = mergeScheduleChange(withWeek, { kind: "pattern", pattern: PATTERN }, NONE);
    expect(withPattern.week).toBeNull();
    expect(withPattern.pattern).toEqual(PATTERN);
    const backToWeek = mergeScheduleChange(withPattern, { kind: "week", week: WEEK }, NONE);
    expect(backToWeek.pattern).toBeNull();
    expect(backToWeek.week).toEqual(WEEK);
  });

  it("график не стирает дни, дни не стирают график", () => {
    const days = mergeScheduleChange(emptyScheduleChanges(), { kind: "days", dates: ["2026-10-07"], action: { kind: "off" } }, NONE);
    const both = mergeScheduleChange(days, { kind: "pattern", pattern: PATTERN }, NONE);
    expect(both.days).toEqual([{ date: "2026-10-07", action: { kind: "off" } }]);
    const more = mergeScheduleChange(both, { kind: "days", dates: ["2026-10-08"], action: { kind: "off" } }, NONE);
    expect(more.pattern).toEqual(PATTERN);
  });

  it("новая правка даты заменяет прежнюю, дни идут по порядку", () => {
    let payload = mergeScheduleChange(
      emptyScheduleChanges(),
      { kind: "days", dates: ["2026-10-09", "2026-10-07"], action: { kind: "off" } },
      NONE,
    );
    payload = mergeScheduleChange(
      payload,
      { kind: "days", dates: ["2026-10-09"], action: { kind: "template", templateId: "tpl-morning" } },
      NONE,
    );
    expect(payload.days).toEqual([
      { date: "2026-10-07", action: { kind: "off" } },
      { date: "2026-10-09", action: { kind: "template", templateId: "tpl-morning" } },
    ]);
  });

  it("«Убрать из заявки» снимает дату", () => {
    const payload = mergeScheduleChange(
      { ...emptyScheduleChanges(), days: [{ date: "2026-10-07", action: { kind: "off" } }] },
      { kind: "days", dates: ["2026-10-07"], action: { kind: "withdraw" } },
      NONE,
    );
    expect(isEmptyScheduleChanges(payload)).toBe(true);
  });

  it("reset без правки в расписании — не изменение; с правкой — изменение", () => {
    const plain = mergeScheduleChange(emptyScheduleChanges(), { kind: "days", dates: ["2026-10-07"], action: { kind: "reset" } }, NONE);
    expect(plain.days).toEqual([]);
    const overridden = mergeScheduleChange(
      emptyScheduleChanges(),
      { kind: "days", dates: ["2026-10-07"], action: { kind: "reset" } },
      { overriddenDates: new Set(["2026-10-07"]) },
    );
    expect(overridden.days).toEqual([{ date: "2026-10-07", action: { kind: "reset" } }]);
  });
});

describe("«Особые дни» старого формата → правки дней", () => {
  const base = { note: null, breaks: [], fixedSlotTimes: [] as string[] };

  it("новые, изменённые и снятые дни; прошедшие и неизменённые не в счёт", () => {
    const current = [
      { ...base, date: "2026-10-01", isWorkday: false, scheduleMode: "FLEXIBLE" as const, startTime: null, endTime: null },
      { ...base, date: "2026-10-06", isWorkday: false, scheduleMode: "FLEXIBLE" as const, startTime: null, endTime: null },
      { ...base, date: "2026-10-08", isWorkday: false, scheduleMode: "FLEXIBLE" as const, startTime: null, endTime: null },
    ];
    const next = [
      // Прошедшая дата — одобрение её всё равно пропустит.
      { ...base, date: "2026-10-02", isWorkday: false, scheduleMode: "FLEXIBLE" as const, startTime: null, endTime: null },
      // Не менялась.
      { ...base, date: "2026-10-06", isWorkday: false, scheduleMode: "FLEXIBLE" as const, startTime: null, endTime: null },
      { ...base, date: "2026-10-07", isWorkday: true, scheduleMode: "FLEXIBLE" as const, startTime: "12:00", endTime: "16:00" },
      {
        ...base,
        date: "2026-10-09",
        isWorkday: true,
        scheduleMode: "FIXED" as const,
        startTime: null,
        endTime: null,
        fixedSlotTimes: ["10:00", "14:00"],
      },
    ];
    const changes = exceptionsToDayChanges(current, next, "2026-10-05");
    expect(changes).toEqual([
      { date: "2026-10-07", action: { kind: "hours", startTime: "12:00", endTime: "16:00", breaks: [] } },
      // Снятая правка — «как по графику».
      { date: "2026-10-08", action: { kind: "reset" } },
      {
        date: "2026-10-09",
        action: { kind: "hours", startTime: "00:00", endTime: "23:55", breaks: [], fixedSlotTimes: ["10:00", "14:00"] },
      },
    ]);
  });

  it("открытая заявка старых форматов переносится без потери содержимого", async () => {
    const fromPattern = await toScheduleChangesPayload(
      prisma as never,
      "prov-1",
      { format: PATTERN_CHANGE_REQUEST_FORMAT, request: PATTERN },
      NOW,
    );
    expect(fromPattern).toMatchObject({ format: SCHEDULE_CHANGES_FORMAT, pattern: PATTERN, week: null, days: [] });

    state.exceptions = [];
    const fromEditor = await toScheduleChangesPayload(
      prisma as never,
      "prov-1",
      {
        format: "EDITOR_V1",
        weekSchedule: WEEK,
        exceptions: [
          { date: "2026-10-07", isWorkday: false, scheduleMode: "FLEXIBLE", startTime: null, endTime: null, breaks: [], fixedSlotTimes: [], note: null },
        ],
      },
      NOW,
    );
    expect(fromEditor.week).toHaveLength(7);
    expect(fromEditor.days).toEqual([{ date: "2026-10-07", action: { kind: "off" } }]);
  });

  it("неделя старой заявки, совпадающая с действующей, — не изменение", async () => {
    state.currentWeek = WEEK;
    const converted = await toScheduleChangesPayload(
      prisma as never,
      "prov-1",
      { format: "EDITOR_V1", weekSchedule: WEEK, exceptions: [] },
      NOW,
    );
    expect(converted.week).toBeNull();
  });
});

describe("открытая заявка профиля в студии", () => {
  it("первая правка создаёт заявку и уведомляет студию", async () => {
    await expect(submit({ kind: "days", dates: ["2026-10-07"], action: { kind: "off" } })).resolves.toBe("created");
    expect(state.created).toHaveLength(1);
    expect(state.created[0]).toMatchObject({
      studioId: "studio-1",
      providerId: "prov-1",
      status: "PENDING",
      payloadJson: { format: SCHEDULE_CHANGES_FORMAT, days: [{ date: "2026-10-07", action: { kind: "off" } }] },
    });
    expect(spies.notified).toBe(1);
  });

  it("следующая правка дополняет ту же заявку, студию не беспокоит", async () => {
    state.pending = request({ days: [{ date: "2026-10-07", action: { kind: "off" } }] });
    await expect(submit({ kind: "pattern", pattern: PATTERN })).resolves.toBe("updated");
    expect(state.updated[0]).toMatchObject({
      payloadJson: { pattern: PATTERN, days: [{ date: "2026-10-07", action: { kind: "off" } }] },
    });
    expect(state.created).toHaveLength(0);
    expect(spies.notified).toBe(0);
  });

  it("правка свелась к нулю — заявка отозвана; пустая правка без заявки — ничего", async () => {
    state.pending = request({ days: [{ date: "2026-10-07", action: { kind: "off" } }] });
    await expect(submit({ kind: "days", dates: ["2026-10-07"], action: { kind: "withdraw" } })).resolves.toBe("withdrawn");
    expect(state.deleted).toEqual(["req-1"]);

    state.pending = null;
    await expect(submit({ kind: "days", dates: ["2026-10-08"], action: { kind: "reset" } })).resolves.toBe("unchanged");
    expect(state.created).toHaveLength(0);
  });

  it("reset на дате со своей правкой в расписании — это изменение", async () => {
    state.overrides = ["2026-10-08"];
    await expect(submit({ kind: "days", dates: ["2026-10-08"], action: { kind: "reset" } })).resolves.toBe("created");
  });
});

describe("одобрение заявки нового формата", () => {
  it("неделя, затем дни пачками по действию; прошедшие дни пропускаются", async () => {
    await applyScheduleChangesRequest(
      "prov-1",
      request({
        week: WEEK,
        days: [
          { date: "2026-10-04", action: { kind: "off" } },
          { date: "2026-10-07", action: { kind: "off" } },
          { date: "2026-10-08", action: { kind: "template", templateId: "tpl-morning" } },
          { date: "2026-10-09", action: { kind: "off" } },
        ],
      }).payloadJson,
      NOW,
    );
    expect(spies.week).toHaveLength(1);
    expect(spies.paint).toEqual([
      { dates: ["2026-10-07", "2026-10-09"], action: { kind: "off" } },
      { dates: ["2026-10-08"], action: { kind: "template", templateId: "tpl-morning" } },
    ]);
    expect(spies.invalidated).toBe(1);
  });

  it("график применяется вместе с днями", async () => {
    await applyScheduleChangesRequest(
      "prov-1",
      request({ pattern: PATTERN, days: [{ date: "2026-10-07", action: { kind: "off" } }] }).payloadJson,
      NOW,
    );
    expect(spies.pattern).toEqual([PATTERN]);
    expect(spies.paint).toHaveLength(1);
  });

  it("рабочий день удалён после отправки — 422 и ничего не покрашено", async () => {
    await expect(
      applyScheduleChangesRequest(
        "prov-1",
        request({ days: [{ date: "2026-10-07", action: { kind: "template", templateId: "tpl-gone" } }] }).payloadJson,
        NOW,
      ),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_REQUEST_PAYLOAD" });
    expect(spies.paint).toHaveLength(0);
    expect(spies.invalidated).toBe(0);
  });
});

describe("«было → стало» для карточки студии", () => {
  it("будущие дни — как сейчас по движку и как станет", async () => {
    const review = await buildScheduleRequestReview(
      "prov-1",
      request({
        days: [
          { date: "2026-10-01", action: { kind: "off" } },
          { date: "2026-10-07", action: { kind: "template", templateId: "tpl-morning" } },
        ],
      }).payloadJson,
      NOW,
    );
    expect(review?.days).toEqual([
      {
        date: "2026-10-07",
        before: { isWorking: true, start: "10:00", end: "19:00", fixed: false, name: null },
        after: { isWorking: true, start: "09:00", end: "15:00", fixed: false, name: "Утро" },
      },
    ]);
  });

  it("у заявки старого формата недели — своей карточки, обзора нет", async () => {
    await expect(
      buildScheduleRequestReview("prov-1", { format: "EDITOR_V1", weekSchedule: WEEK, exceptions: [] }, NOW),
    ).resolves.toBeNull();
  });
});

describe("карточка заявки у студии", () => {
  it("тело: график, число правок дней; неделя и график не вместе", () => {
    const preview = buildSchedulePayloadPreview(
      request({ pattern: PATTERN, days: [{ date: "2026-10-07", action: { kind: "off" } }] }).payloadJson,
    );
    expect(preview).toMatchObject({ format: "CHANGES_V1", week: null, dayCount: 1 });
    expect(preview.format === "CHANGES_V1" && preview.pattern?.summary).toBe("2 через 2 · 10:00–19:00");
  });

  it("«было → стало» словами: выходной, рабочий день палитры, как по графику", () => {
    const preview = buildReviewPreview({
      currentPattern: null,
      currentTemplates: [],
      days: [
        {
          date: "2026-10-07",
          before: { isWorking: true, start: "10:00", end: "19:00", fixed: false, name: null },
          after: { isWorking: false, start: null, end: null, fixed: false, name: null },
        },
        {
          date: "2026-10-08",
          before: { isWorking: false, start: null, end: null, fixed: false, name: null },
          after: { isWorking: true, start: "09:00", end: "15:00", fixed: false, name: "Утро" },
        },
        {
          date: "2026-10-09",
          before: { isWorking: true, start: "12:00", end: "16:00", fixed: false, name: null },
          after: null,
        },
      ],
    });
    expect(preview.current).toBeNull();
    expect(preview.days.map((day) => [day.before, day.after])).toEqual([
      ["10:00–19:00", "Выходной"],
      ["Выходной", "Утро · 09:00–15:00"],
      ["12:00–16:00", "как по графику"],
    ]);
  });
});
