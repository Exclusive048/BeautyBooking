import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/schedule/slotsCache", () => ({ invalidateSlotsForMaster: vi.fn() }));

import { buildSchedulePayloadPreview } from "@/features/studio-cabinet/schedule-requests/lib/payload-display";
import { patternRequestForApproval } from "@/lib/schedule/pattern-apply";
import { isPatternChangeRequestPayload, PATTERN_CHANGE_REQUEST_FORMAT } from "@/lib/schedule/patterns-shared";

/**
 * SCHEDULE-PATTERNS-01 (этап 4) — заявка мастера на расписание в студии в
 * формате графика: узнаётся карточкой заявки, показывается человеческими
 * словами и при одобрении применяется «на сегодня» — прошлое не переписывается.
 */

const REQUEST = {
  templates: [{ startTime: "10:00", endTime: "19:00", breaks: [], scheduleMode: "FLEXIBLE", fixedSlotTimes: [] }],
  pattern: {
    kind: "CYCLE",
    cycleDays: 4,
    anchorOn: "2026-10-01",
    startsOn: "2026-10-01",
    endsOn: "2026-12-29",
    days: [0, 0, null, null],
    resumePrevious: false,
  },
};

describe("заявка в формате графика", () => {
  it("узнаётся по формату, старая заявка — нет", () => {
    expect(isPatternChangeRequestPayload({ format: PATTERN_CHANGE_REQUEST_FORMAT, request: REQUEST })).toBe(true);
    expect(isPatternChangeRequestPayload({ format: "EDITOR_V1", weekSchedule: [], exceptions: [] })).toBe(false);
  });

  it("карточка заявки — сводка графика, срок и часы", () => {
    const preview = buildSchedulePayloadPreview({ format: PATTERN_CHANGE_REQUEST_FORMAT, request: REQUEST });
    expect(preview).toMatchObject({ format: "PATTERN_V1", summary: "2 через 2 · 10:00–19:00", days: ["10:00–19:00"] });
    expect(preview.format === "PATTERN_V1" && preview.period).toContain("01.10");
  });

  it("одобрение позже даты начала — график начинается сегодня", () => {
    const request = patternRequestForApproval(REQUEST, "2026-10-05");
    expect(request.pattern.startsOn).toBe("2026-10-05");
    // Раскладка чередования не сдвигается: дата отсчёта прежняя.
    expect(request.pattern.anchorOn).toBe("2026-10-01");
  });

  it("график, который уже кончился, не применяется", () => {
    expect(() => patternRequestForApproval(REQUEST, "2027-01-10")).toThrow(/уже закончился/);
  });

  it("повреждённое тело — «старый формат» (роут одобрения отвечает 422 с просьбой отправить заново)", () => {
    expect(() => patternRequestForApproval({ templates: "x" }, "2026-10-05")).toThrow(/старом формате/);
  });
});
