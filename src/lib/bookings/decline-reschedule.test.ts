import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RESCHEDULE-DECLINE-RESTORE-STATUS (2026-09-24, решение владельца) — отказ от
 * переноса возвращает статус, который был ДО запроса, а не безусловный
 * `CONFIRMED`: неподтверждённая запись, по которой мастер предложил перенос, а
 * клиент отказался, остаётся неподтверждённой.
 *
 * @probe 2026-09-24 — в `declineClientRescheduleRequest` статус снова пишется
 * литералом `"CONFIRMED"`: красный «неподтверждённая запись остаётся в
 * ожидании». Возвращено — зелёный.
 */

const { findUnique, applyBookingTransition, scheduleBookingRemindersSafe } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  applyBookingTransition: vi.fn(async (_db: unknown, input: { id: string; data: { status: string } }) => ({
    id: input.id,
    status: input.data.status,
  })),
  scheduleBookingRemindersSafe: vi.fn(async () => undefined),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { booking: { findUnique } } }));
vi.mock("@/lib/bookings/transition", () => ({ applyBookingTransition }));
vi.mock("@/lib/bookings/reminders", () => ({ scheduleBookingRemindersSafe }));

import { declineClientRescheduleRequest, restoredStatusAfterDecline } from "./decline-reschedule";

function pending(statusBeforeChange: string | null) {
  return {
    id: "b1",
    status: "CHANGE_REQUESTED",
    startAtUtc: new Date(Date.now() + 3 * 24 * 3600_000),
    endAtUtc: new Date(Date.now() + 3 * 24 * 3600_000 + 3600_000),
    actionRequiredBy: "CLIENT",
    requestedBy: "MASTER",
    statusBeforeChange,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("отказ от переноса — прежний статус", () => {
  it("неподтверждённая запись остаётся в ожидании, напоминаний нет", async () => {
    findUnique.mockResolvedValueOnce(pending("PENDING"));

    const result = await declineClientRescheduleRequest("b1", "CLIENT");

    expect(result.status).toBe("PENDING");
    expect(applyBookingTransition.mock.calls[0]![1]).toMatchObject({
      data: { status: "PENDING", statusBeforeChange: null, proposedStartAt: null },
    });
    expect(scheduleBookingRemindersSafe).not.toHaveBeenCalled();
  });

  it("подтверждённая остаётся подтверждённой, напоминания планируются", async () => {
    findUnique.mockResolvedValueOnce(pending("CONFIRMED"));

    const result = await declineClientRescheduleRequest("b1", "CLIENT");

    expect(result.status).toBe("CONFIRMED");
    expect(scheduleBookingRemindersSafe).toHaveBeenCalledWith("b1");
  });

  it("строка до миграции (null) — прежнее поведение, CONFIRMED", () => {
    expect(restoredStatusAfterDecline(null)).toBe("CONFIRMED");
    expect(restoredStatusAfterDecline("PREPAID")).toBe("PREPAID");
    // статусы, из которых перенос не входит, не восстанавливаются
    expect(restoredStatusAfterDecline("REJECTED")).toBe("CONFIRMED");
  });
});
