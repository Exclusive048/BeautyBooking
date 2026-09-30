import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import {
  assertClearanceMatches,
  clearClientWindow,
  clearOfferTime,
  clearOperatorTime,
  clearStudioAdminTime,
  type BookingTimeClearance,
} from "./booking-time-policy";
import type { createBookingRow } from "./booking-row";
import { stricterAcceptNewClients } from "./policy-enforcement";

/**
 * 29.09 доработки · 07 — политика времени по путям записи (таблица в шапке
 * `policy-enforcement.ts`, решения владельца 2026-09-29) и тип, который не даёт
 * пути создания промолчать о ней.
 *
 * @probe 2026-09-29 — в `createBookingRow` поле `timePolicy` сделано
 * необязательным: `typecheck` красный — «Unused '@ts-expect-error' directive»
 * на вызове без поля. Возвращено — зелёный.
 * @probe 2026-09-29 — из `clearStudioAdminTime` убран `assertWithinMaxDaysAhead`:
 * покраснел «админ студии: дальше максимума — нельзя». Возвращено — зелёный.
 */

const NOW = new Date("2026-09-29T10:00:00Z");
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000);
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof AppError ? error.code : "not-app-error";
  }
}

describe("клиент (воронка, пакеты) — полное окно", () => {
  const window = { minBookingHoursAhead: 3, maxBookingDaysAhead: 30 };
  const open = { acceptNewClients: true };

  it("раньше «минимум за» — нельзя", () => {
    expect(
      code(() => clearClientWindow({ startAtUtc: inMinutes(30), window, acceptNewClients: open, priorBookingsCount: null, now: NOW })),
    ).toBe("BOOKING_TOO_SOON");
  });

  it("новый клиент к закрытому для новых — нельзя", () => {
    expect(
      code(() =>
        clearClientWindow({
          startAtUtc: inDays(2),
          window,
          acceptNewClients: { acceptNewClients: false },
          priorBookingsCount: 0,
          now: NOW,
        }),
      ),
    ).toBe("NEW_CLIENTS_CLOSED");
  });

  it("в окне — разрешение «client-window»", () => {
    const clearance = clearClientWindow({ startAtUtc: inDays(2), window, acceptNewClients: open, priorBookingsCount: null, now: NOW });
    expect(clearance.kind).toBe("client-window");
  });
});

describe("админ студии — «максимум» и «новые клиенты», без «минимум за», прошлое можно", () => {
  const window = { maxBookingDaysAhead: 14 };
  const open = { acceptNewClients: true };

  it("через 30 минут при «минимум за 3 ч» — можно (звонок)", () => {
    expect(
      clearStudioAdminTime({ startAtUtc: inMinutes(30), window, acceptNewClients: open, priorBookingsCount: 0, now: NOW }).kind,
    ).toBe("studio-admin");
  });

  it("админ студии: дальше максимума — нельзя", () => {
    expect(
      code(() => clearStudioAdminTime({ startAtUtc: inDays(20), window, acceptNewClients: open, priorBookingsCount: 0, now: NOW })),
    ).toBe("BOOKING_TOO_FAR");
  });

  it("прошедший визит — можно занести", () => {
    expect(
      clearStudioAdminTime({ startAtUtc: inDays(-1), window, acceptNewClients: open, priorBookingsCount: 0, now: NOW }).kind,
    ).toBe("studio-admin");
  });

  it("новый клиент к закрытому мастеру — нельзя, знакомый — можно", () => {
    const closed = stricterAcceptNewClients({ acceptNewClients: true }, { acceptNewClients: false });
    expect(closed.acceptNewClients).toBe(false);
    expect(
      code(() => clearStudioAdminTime({ startAtUtc: inDays(1), window, acceptNewClients: closed, priorBookingsCount: 0, now: NOW })),
    ).toBe("NEW_CLIENTS_CLOSED");
    expect(
      clearStudioAdminTime({ startAtUtc: inDays(1), window, acceptNewClients: closed, priorBookingsCount: 2, now: NOW }).kind,
    ).toBe("studio-admin");
  });
});

describe("мастер вручную и оффер", () => {
  it("ручная запись мастера — любое время, в том числе прошедшее", () => {
    expect(clearOperatorTime(inDays(-3)).kind).toBe("operator");
    expect(clearOperatorTime(inDays(200)).kind).toBe("operator");
  });

  it("оффер: прошедшее время — нельзя, будущее — можно", () => {
    expect(code(() => clearOfferTime(inMinutes(-5), NOW))).toBe("CONFLICT");
    expect(clearOfferTime(inMinutes(5), NOW).kind).toBe("offer");
  });
});

describe("writer сверяет разрешение со временем записи", () => {
  it("расхождение — ошибка программиста", () => {
    const clearance = clearOperatorTime(inDays(1));
    expect(() => assertClearanceMatches(clearance, inDays(1))).not.toThrow();
    expect(code(() => assertClearanceMatches(clearance, inDays(2)))).toBe("INTERNAL_ERROR");
  });
});

describe("тип: путь создания не может промолчать о политике времени", () => {
  type WriterArgs = Parameters<typeof createBookingRow>[1];
  const data = {
    providerId: "p",
    serviceId: "s",
    slotLabel: "l",
    clientName: "c",
    clientPhone: "p",
    source: "WEB",
    startAtUtc: NOW,
  } as const;

  it("без поля и с самодельным объектом — не компилируется", () => {
    // @ts-expect-error — `timePolicy` обязателен.
    const withoutPolicy: WriterArgs = { data, select: { id: true } };
    const forged: WriterArgs = {
      data,
      select: { id: true },
      // @ts-expect-error — литерал без бренда не является разрешением.
      timePolicy: { startAtUtc: NOW, kind: "operator" },
    };
    const issued: WriterArgs = { data, select: { id: true }, timePolicy: clearOperatorTime(NOW) };
    expect([withoutPolicy, forged, issued]).toHaveLength(3);
    const policy: BookingTimeClearance = issued.timePolicy;
    expect(policy.kind).toBe("operator");
  });
});
