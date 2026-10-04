import { describe, expect, it } from "vitest";
import {
  resolveStudioBookingActions,
  studioBookingNeedsAnswer,
  type StudioBookingActionInput,
} from "./studio-actions";

/**
 * MOBILE-STUDIO-C (ops) — действия администратора студии над записью для
 * приложения. Флаги обязаны совпадать с тем, что примет сервер для стороны
 * студии (`confirmBooking`, `declineClientRescheduleRequest`, `cancelBooking`,
 * `moveStudioBooking`), — иначе приложение покажет кнопку, которая ответит 409.
 */

const NOW = new Date("2026-10-04T09:00:00Z");
const inMinutes = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

function input(overrides: Partial<StudioBookingActionInput> = {}): StudioBookingActionInput {
  const start = inMinutes(24 * 60);
  return {
    status: "CONFIRMED",
    startAtUtc: start,
    endAtUtc: new Date(start.getTime() + 60 * 60_000),
    actionRequiredBy: null,
    proposedStartAt: null,
    proposedEndAt: null,
    bookingPackageId: null,
    now: NOW,
    ...overrides,
  };
}

describe("resolveStudioBookingActions", () => {
  it("неподтверждённая запись: подтвердить, перенести, отменить", () => {
    const actions = resolveStudioBookingActions(input({ status: "PENDING", actionRequiredBy: "MASTER" }));
    expect(actions).toEqual({
      confirm: true,
      acceptReschedule: false,
      declineReschedule: false,
      awaitingClient: false,
      move: true,
      cancel: true,
      wholePackageOnly: false,
    });
    expect(studioBookingNeedsAnswer(actions)).toBe(true);
  });

  it("NEW считается неподтверждённой", () => {
    expect(resolveStudioBookingActions(input({ status: "NEW" })).confirm).toBe(true);
  });

  it("без времени подтвердить нельзя (сервер ответит BOOKING_TIME_REQUIRED)", () => {
    expect(resolveStudioBookingActions(input({ status: "PENDING", startAtUtc: null, endAtUtc: null })).confirm).toBe(
      false,
    );
  });

  it("подтверждённая: перенести и отменить, отвечать нечего", () => {
    const actions = resolveStudioBookingActions(input());
    expect(actions).toMatchObject({ confirm: false, move: true, cancel: true, acceptReschedule: false });
    expect(studioBookingNeedsAnswer(actions)).toBe(false);
  });

  it("PREPAID ведёт себя как подтверждённая", () => {
    expect(resolveStudioBookingActions(input({ status: "PREPAID" }))).toMatchObject({ confirm: false, cancel: true });
  });

  it("у стороны студии нет окна 60 минут: за 10 минут до начала отменить и перенести можно", () => {
    const start = inMinutes(10);
    const actions = resolveStudioBookingActions(
      input({ startAtUtc: start, endAtUtc: new Date(start.getTime() + 60 * 60_000) }),
    );
    expect(actions).toMatchObject({ move: true, cancel: true });
  });

  it("клиент просит перенос: принять, отказать, отменить, перенести", () => {
    const proposed = inMinutes(48 * 60);
    const actions = resolveStudioBookingActions(
      input({
        status: "CHANGE_REQUESTED",
        actionRequiredBy: "MASTER",
        proposedStartAt: proposed,
        proposedEndAt: new Date(proposed.getTime() + 60 * 60_000),
      }),
    );
    expect(actions).toMatchObject({
      confirm: false,
      acceptReschedule: true,
      declineReschedule: true,
      awaitingClient: false,
      move: true,
      cancel: true,
    });
    expect(studioBookingNeedsAnswer(actions)).toBe(true);
  });

  it("предложенное время уже прошло: принять нельзя, отказать можно", () => {
    const proposed = inMinutes(-30);
    const actions = resolveStudioBookingActions(
      input({
        status: "CHANGE_REQUESTED",
        actionRequiredBy: "MASTER",
        proposedStartAt: proposed,
        proposedEndAt: new Date(proposed.getTime() + 60 * 60_000),
      }),
    );
    expect(actions.acceptReschedule).toBe(false);
    expect(actions.declineReschedule).toBe(true);
  });

  it("перенос без предложенного времени: принять нельзя", () => {
    const actions = resolveStudioBookingActions(input({ status: "CHANGE_REQUESTED", actionRequiredBy: "MASTER" }));
    expect(actions.acceptReschedule).toBe(false);
    expect(actions.declineReschedule).toBe(true);
  });

  it("ждём ответа клиента: отвечать нечего, перенести и отменить можно", () => {
    const proposed = inMinutes(48 * 60);
    const actions = resolveStudioBookingActions(
      input({
        status: "CHANGE_REQUESTED",
        actionRequiredBy: "CLIENT",
        proposedStartAt: proposed,
        proposedEndAt: new Date(proposed.getTime() + 60 * 60_000),
      }),
    );
    expect(actions).toMatchObject({
      confirm: false,
      acceptReschedule: false,
      declineReschedule: false,
      awaitingClient: true,
      move: true,
      cancel: true,
    });
    expect(studioBookingNeedsAnswer(actions)).toBe(false);
  });

  it("запись уже идёт: ничего нельзя", () => {
    const start = inMinutes(-10);
    const actions = resolveStudioBookingActions(
      input({ status: "PENDING", startAtUtc: start, endAtUtc: new Date(start.getTime() + 60 * 60_000) }),
    );
    expect(actions).toMatchObject({ confirm: false, move: false, cancel: false });
  });

  it("отменённая и завершённая: ничего нельзя", () => {
    for (const status of ["REJECTED", "CANCELLED", "NO_SHOW", "FINISHED"] as const) {
      const actions = resolveStudioBookingActions(input({ status }));
      expect(actions).toMatchObject({ confirm: false, move: false, cancel: false, declineReschedule: false });
    }
  });

  it("запись пакета: отмена только пакетом", () => {
    const actions = resolveStudioBookingActions(input({ bookingPackageId: "pkg-1" }));
    expect(actions).toMatchObject({ cancel: true, wholePackageOnly: true });
  });
});
