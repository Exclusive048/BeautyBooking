import { describe, expect, it } from "vitest";
import type { ScheduleRequestListItem } from "../server/list.service";
import { toScheduleRequestJson } from "./request-json";

/** MOBILE-STUDIO-C (team) — заявка на расписание в приложении: готовый текст, без сырого тела. */

const BASE: ScheduleRequestListItem = {
  id: "req-1",
  status: "PENDING",
  comment: null,
  createdAt: "2026-10-03T08:00:00.000Z",
  updatedAt: "2026-10-03T08:00:00.000Z",
  provider: { id: "m-1", name: "Анна", avatarUrl: "/api/media/file/a1" },
  payload: { format: "CHANGES_V1", week: null, pattern: null, days: [{ date: "2026-10-07", action: { kind: "off" } }] },
  review: null,
};

describe("toScheduleRequestJson", () => {
  it("lets the studio approve or reject an open request it can apply", () => {
    const json = toScheduleRequestJson(BASE);

    expect(json).toMatchObject({
      id: "req-1",
      status: "PENDING",
      provider: { id: "m-1", name: "Анна", avatarUrl: "/api/media/file/a1" },
      canApprove: true,
      canReject: true,
      preview: { format: "CHANGES_V1", pattern: null, week: null, dayCount: 1 },
      reviewPreview: null,
    });
    expect(json).not.toHaveProperty("payload");
    expect(json).not.toHaveProperty("review");
  });

  it("only lets the studio reject an open request in an old format", () => {
    const json = toScheduleRequestJson({ ...BASE, payload: { overrides: [{}, {}] } });

    expect(json.preview).toEqual({ format: "LEGACY", summary: "Особых дней: 2" });
    expect(json).toMatchObject({ canApprove: false, canReject: true });
  });

  it("offers no decision on a decided request", () => {
    const json = toScheduleRequestJson({ ...BASE, status: "REJECTED", comment: "Нет" });

    expect(json).toMatchObject({ status: "REJECTED", comment: "Нет", canApprove: false, canReject: false });
  });

  it("describes the days before and after with a salon date key and a label", () => {
    const json = toScheduleRequestJson({
      ...BASE,
      review: {
        currentPattern: null,
        currentTemplates: [],
        days: [
          {
            date: "2026-10-07",
            before: { isWorking: true, start: "10:00", end: "19:00", fixed: false, name: null },
            after: { isWorking: false, start: null, end: null, fixed: false, name: null },
          },
          {
            date: "2026-10-09",
            before: { isWorking: true, start: "12:00", end: "16:00", fixed: false, name: null },
            after: null,
          },
        ],
      },
    });

    expect(json.reviewPreview?.current).toBeNull();
    expect(json.reviewPreview?.days).toEqual([
      { date: "2026-10-07", dateLabel: "07.10", before: "10:00–19:00", after: "Выходной" },
      { date: "2026-10-09", dateLabel: "09.10", before: "12:00–16:00", after: "как по графику" },
    ]);
  });
});
