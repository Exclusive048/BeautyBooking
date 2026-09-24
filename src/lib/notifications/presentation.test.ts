import { describe, expect, it } from "vitest";
import { resolveNotificationOpenHref } from "./presentation";

/**
 * RESCHEDULE-CURRENT-TIME: ответ клиента на предложенный мастером перенос
 * уходит мастеру типами «клиентской» семантики (`BOOKING_CONFIRMED` /
 * `BOOKING_DECLINED`). Центр знает канал получателя и отдаёт стороне
 * провайдера кабинетную ссылку; без канала (toast из SSE) — прежний href.
 *
 * @probe убрано `(providerSide && BOOKING_CLIENT_HREF_TYPES.has(type))` →
 * первый кейс красный (клиентский href у мастера).
 */
describe("resolveNotificationOpenHref — канал получателя (RESCHEDULE-CURRENT-TIME)", () => {
  const payload = {
    bookingId: "bk-9",
    providerType: "MASTER",
    startAtUtc: "2026-09-20T07:00:00.000Z",
    providerTimezone: "Europe/Moscow",
  };

  it("BOOKING_CONFIRMED у мастера ведёт в его кабинет", () => {
    expect(resolveNotificationOpenHref("BOOKING_CONFIRMED", payload, "MASTER")).toBe(
      "/cabinet/master/dashboard?focus=bk-9",
    );
    expect(resolveNotificationOpenHref("BOOKING_DECLINED", payload, "MASTER")).toBe(
      "/cabinet/master/dashboard?focus=bk-9",
    );
  });

  it("у студии — в календарь на день брони", () => {
    expect(
      resolveNotificationOpenHref("BOOKING_CONFIRMED", { ...payload, providerType: "STUDIO" }, "STUDIO"),
    ).toBe("/cabinet/studio/calendar?view=day&date=2026-09-20&focus=bk-9");
  });

  it("без канала и для SYSTEM — клиентская ссылка, как раньше", () => {
    expect(resolveNotificationOpenHref("BOOKING_CONFIRMED", payload)).toBe("/cabinet/bookings?focus=bk-9");
    expect(resolveNotificationOpenHref("BOOKING_CONFIRMED", payload, "SYSTEM")).toBe(
      "/cabinet/bookings?focus=bk-9",
    );
  });
});

/**
 * NO-SHOW-UI: уведомление о неявке теперь адресовано клиенту — ссылка ведёт в
 * его записи; старые уведомления мастеру (до 2026-09-24) по каналу получателя
 * по-прежнему открывают кабинет.
 *
 * @probe `BOOKING_NO_SHOW` возвращён в мастерский набор → первый кейс красный
 * (клиент уходил на `/cabinet/master/dashboard`).
 */
describe("resolveNotificationOpenHref — неявка (NO-SHOW-UI)", () => {
  const payload = { bookingId: "bk-7", providerType: "MASTER" };

  it("клиенту — его записи", () => {
    expect(resolveNotificationOpenHref("BOOKING_NO_SHOW", payload)).toBe("/cabinet/bookings?focus=bk-7");
    expect(resolveNotificationOpenHref("BOOKING_NO_SHOW", payload, "SYSTEM")).toBe(
      "/cabinet/bookings?focus=bk-7",
    );
  });

  it("старое уведомление мастеру — кабинет мастера", () => {
    expect(resolveNotificationOpenHref("BOOKING_NO_SHOW", payload, "MASTER")).toBe(
      "/cabinet/master/dashboard?focus=bk-7",
    );
  });
});

describe("resolveNotificationOpenHref — studio booking deep-link", () => {
  it("lands on the exact booking's calendar day, computed in SALON tz", () => {
    // BOOKING-STUDIO-RESCHEDULE-PARITY-01 + timezone-correctness anchor:
    // 21:00Z at Asia/Yekaterinburg (+5) is 02:00 the NEXT salon-local day, so
    // the `?date` must be 2026-07-11 (not the UTC calendar day 2026-07-10).
    const href = resolveNotificationOpenHref("BOOKING_RESCHEDULE_REQUESTED", {
      bookingId: "bk-1",
      providerType: "STUDIO",
      startAtUtc: "2026-07-10T21:00:00.000Z",
      providerTimezone: "Asia/Yekaterinburg",
    });
    expect(href).toBe(
      "/cabinet/studio/calendar?view=day&date=2026-07-11&focus=bk-1",
    );
  });

  it("falls back to ?focus= only for a legacy payload without a salon tz", () => {
    const href = resolveNotificationOpenHref("BOOKING_RESCHEDULE_REQUESTED", {
      bookingId: "bk-1",
      providerType: "STUDIO",
      startAtUtc: "2026-07-10T21:00:00.000Z",
    });
    expect(href).toBe("/cabinet/studio/calendar?focus=bk-1");
  });

  it("parses a stringified payload the same way", () => {
    const href = resolveNotificationOpenHref(
      "BOOKING_RESCHEDULE_REQUESTED",
      JSON.stringify({
        bookingId: "bk-1",
        providerType: "STUDIO",
        startAtUtc: "2026-07-10T21:00:00.000Z",
        providerTimezone: "Asia/Yekaterinburg",
      }),
    );
    expect(href).toBe(
      "/cabinet/studio/calendar?view=day&date=2026-07-11&focus=bk-1",
    );
  });

  it("keeps the master (non-studio) deep-link unchanged", () => {
    expect(
      resolveNotificationOpenHref("BOOKING_RESCHEDULE_REQUESTED", {
        bookingId: "bk-2",
        providerType: "MASTER",
      }),
    ).toBe("/cabinet/master/dashboard?focus=bk-2");
  });

  it("returns undefined when the payload has no bookingId", () => {
    expect(
      resolveNotificationOpenHref("BOOKING_RESCHEDULE_REQUESTED", {
        providerType: "STUDIO",
      }),
    ).toBeUndefined();
  });
});
