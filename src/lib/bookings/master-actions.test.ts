import { describe, expect, it } from "vitest";
import { bookingNeedsMasterAnswer, resolveMasterBookingActions, type MasterBookingActionInput } from "./master-actions";

/**
 * MOBILE-MASTER-C — действия мастера над записью для приложения. Флаги обязаны
 * совпадать с тем, что примет сервер (`confirmBooking`,
 * `updateMasterBookingStatus`, `rescheduleBooking`), — иначе приложение
 * покажет кнопку, которая ответит 409.
 */

const NOW = new Date("2026-10-03T09:00:00Z");
const inMinutes = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

function input(overrides: Partial<MasterBookingActionInput> = {}): MasterBookingActionInput {
  const start = inMinutes(24 * 60);
  return {
    status: "CONFIRMED",
    startAtUtc: start,
    endAtUtc: new Date(start.getTime() + 60 * 60_000),
    actionRequiredBy: null,
    requestedBy: null,
    bookingPackageId: null,
    masterChangeRequestsCount: 0,
    now: NOW,
    ...overrides,
  };
}

describe("resolveMasterBookingActions", () => {
  it("новая запись: подтвердить, отклонить, перенести; отменять нечего", () => {
    const actions = resolveMasterBookingActions(input({ status: "PENDING", actionRequiredBy: "MASTER" }));
    expect(actions).toMatchObject({
      confirm: true,
      decline: true,
      declineReschedule: false,
      cancel: false,
      reschedule: true,
      noShow: false,
      awaitingClient: false,
      modifyWindowClosed: false,
    });
  });

  it("NEW считается неподтверждённой", () => {
    expect(resolveMasterBookingActions(input({ status: "NEW" })).confirm).toBe(true);
  });

  it("подтверждённая: отменить и перенести, подтверждать нечего", () => {
    expect(resolveMasterBookingActions(input())).toMatchObject({
      confirm: false,
      decline: false,
      cancel: true,
      reschedule: true,
      noShow: false,
    });
  });

  it("меньше 60 минут до начала: отказ, отмена и перенос закрыты, подтвердить можно", () => {
    const start = inMinutes(30);
    const pending = resolveMasterBookingActions(
      input({ status: "PENDING", startAtUtc: start, endAtUtc: inMinutes(90) }),
    );
    expect(pending).toMatchObject({ confirm: true, decline: false, reschedule: false, modifyWindowClosed: true });
    const confirmed = resolveMasterBookingActions(input({ startAtUtc: start, endAtUtc: inMinutes(90) }));
    expect(confirmed).toMatchObject({ cancel: false, reschedule: false, modifyWindowClosed: true });
  });

  it("клиент просит перенос: принять или отказать в переносе без окна; отклонить запись нельзя", () => {
    const actions = resolveMasterBookingActions(
      input({
        status: "CHANGE_REQUESTED",
        actionRequiredBy: "MASTER",
        requestedBy: "CLIENT",
        startAtUtc: inMinutes(30),
        endAtUtc: inMinutes(90),
      }),
    );
    expect(actions).toMatchObject({
      confirm: true,
      declineReschedule: true,
      decline: false,
      reschedule: false,
      awaitingClient: false,
    });
  });

  it("мастер сам предложил перенос: ждём клиента, подтверждать и переносить нечего", () => {
    const actions = resolveMasterBookingActions(
      input({ status: "CHANGE_REQUESTED", actionRequiredBy: "CLIENT", requestedBy: "MASTER" }),
    );
    expect(actions).toMatchObject({
      confirm: false,
      declineReschedule: false,
      reschedule: false,
      awaitingClient: true,
      cancel: true,
    });
  });

  it("приём идёт: только неявка", () => {
    const actions = resolveMasterBookingActions(
      input({ startAtUtc: inMinutes(-10), endAtUtc: inMinutes(50) }),
    );
    expect(actions).toMatchObject({
      confirm: false,
      decline: false,
      cancel: false,
      reschedule: false,
      noShow: true,
      modifyWindowClosed: false,
    });
  });

  it("неподтверждённая начавшаяся запись — неявку не отметить", () => {
    const actions = resolveMasterBookingActions(
      input({ status: "PENDING", startAtUtc: inMinutes(-10), endAtUtc: inMinutes(50) }),
    );
    expect(actions.noShow).toBe(false);
    expect(actions.confirm).toBe(false);
  });

  it("завершённая и отменённая — без действий", () => {
    const done = resolveMasterBookingActions(input({ startAtUtc: inMinutes(-300), endAtUtc: inMinutes(-240) }));
    const cancelled = resolveMasterBookingActions(input({ status: "CANCELLED" }));
    for (const actions of [done, cancelled]) {
      expect(actions).toMatchObject({
        confirm: false,
        decline: false,
        declineReschedule: false,
        cancel: false,
        reschedule: false,
        noShow: false,
        modifyWindowClosed: false,
      });
    }
  });

  it("лимит переносов мастера исчерпан — перенос закрыт", () => {
    const actions = resolveMasterBookingActions(input({ masterChangeRequestsCount: 3 }));
    expect(actions).toMatchObject({ reschedule: false, rescheduleLimitReached: true, cancel: true });
  });

  it("компонент пакета — отмена только пакетом", () => {
    expect(resolveMasterBookingActions(input({ bookingPackageId: "pkg-1" })).wholePackageOnly).toBe(true);
    expect(resolveMasterBookingActions(input()).wholePackageOnly).toBe(false);
  });

  it("без времени начала отмена и перенос закрыты (сервер ответит BOOKING_TIME_REQUIRED)", () => {
    const actions = resolveMasterBookingActions(input({ startAtUtc: null, endAtUtc: null }));
    expect(actions).toMatchObject({ cancel: false, reschedule: false, modifyWindowClosed: true });
  });
});

describe("bookingNeedsMasterAnswer", () => {
  it("новая и перенос от клиента — ждут ответа; начавшаяся — уже нет", () => {
    const base = { startAtUtc: inMinutes(120), endAtUtc: inMinutes(180), now: NOW };
    expect(bookingNeedsMasterAnswer({ ...base, status: "PENDING", actionRequiredBy: "MASTER" })).toBe(true);
    expect(bookingNeedsMasterAnswer({ ...base, status: "CHANGE_REQUESTED", actionRequiredBy: "MASTER" })).toBe(true);
    expect(bookingNeedsMasterAnswer({ ...base, status: "CHANGE_REQUESTED", actionRequiredBy: "CLIENT" })).toBe(false);
    expect(
      bookingNeedsMasterAnswer({
        status: "PENDING",
        actionRequiredBy: "MASTER",
        startAtUtc: inMinutes(-5),
        endAtUtc: inMinutes(55),
        now: NOW,
      }),
    ).toBe(false);
  });
});
