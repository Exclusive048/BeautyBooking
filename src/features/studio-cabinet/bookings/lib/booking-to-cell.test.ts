import { BookingSource, BookingStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { bookingToCell } from "./booking-to-cell";
import type { StudioBookingRow } from "../server/types";

/**
 * BOOKING-JOURNAL-SERVICEID-01 — the journal `bookingToCell` adapter must
 * thread the booking's real gating service (was hardcoded `""`), so
 * Move-from-journal gates the target-master picker identically to
 * Move-from-calendar (`master.serviceIds.includes(cell.serviceId)`).
 */

function makeRow(overrides: Partial<StudioBookingRow> = {}): StudioBookingRow {
  return {
    id: "bk-1",
    startAtUtc: "2026-07-07T08:00:00.000Z",
    endAtUtc: "2026-07-07T09:00:00.000Z",
    master: {
      id: "master-1",
      displayName: "Марина",
      avatarUrl: null,
      specialization: "Маникюр",
    },
    client: {
      displayName: "Елена",
      phone: "+79995000000",
      isNewClient: false,
      isVip: false,
    },
    serviceId: "svc-manicure",
    service: { name: "Маникюр", durationMin: 60 },
    priceKopeks: 250000,
    source: BookingSource.WEB,
    status: BookingStatus.CONFIRMED,
    proposedStartAtUtc: null,
    proposedEndAtUtc: null,
    actionRequiredBy: null,
    bookingPackageId: null,
    ...overrides,
  };
}

/**
 * Mirror of the client-side gating predicate in `MoveBookingDialog`
 * (`mode === "master"`): a target master is selectable iff its enabled
 * `serviceIds` include the booking's gating service.
 */
function masterPerformsService(masterServiceIds: string[], cellServiceId: string): boolean {
  return masterServiceIds.includes(cellServiceId);
}

describe("bookingToCell — serviceId threading (BOOKING-JOURNAL-SERVICEID-01)", () => {
  it("maps the booking's real serviceId (never the old `\"\"` placeholder)", () => {
    const cell = bookingToCell(makeRow({ serviceId: "svc-pedicure" }));
    expect(cell.serviceId).toBe("svc-pedicure");
    expect(cell.serviceId).not.toBe("");
  });

  it("preserves the other cell fields used by the action menu", () => {
    const cell = bookingToCell(makeRow());
    expect(cell.id).toBe("bk-1");
    expect(cell.masterId).toBe("master-1");
    expect(cell.startAtUtc).toBe("2026-07-07T08:00:00.000Z");
    expect(cell.endAtUtc).toBe("2026-07-07T09:00:00.000Z");
    expect(cell.status).toBe(BookingStatus.CONFIRMED);
    expect(cell.serviceTitle).toBe("Маникюр");
    expect(cell.clientName).toBe("Елена");
    expect(cell.priceKopeks).toBe(250000);
  });

  it("carries a client-proposed reschedule through unchanged", () => {
    const cell = bookingToCell(
      makeRow({
        status: BookingStatus.CHANGE_REQUESTED,
        proposedStartAtUtc: "2026-07-08T10:00:00.000Z",
        proposedEndAtUtc: "2026-07-08T11:00:00.000Z",
        actionRequiredBy: "MASTER",
      }),
    );
    expect(cell.proposedStartAtUtc).toBe("2026-07-08T10:00:00.000Z");
    expect(cell.actionRequiredBy).toBe("MASTER");
  });
});

describe("Move-from-journal master gating — parity with calendar", () => {
  it("enables a target master who performs the booking's service", () => {
    const cell = bookingToCell(makeRow({ serviceId: "svc-manicure" }));
    // Марина performs manicure → selectable.
    expect(masterPerformsService(["svc-manicure", "svc-pedicure"], cell.serviceId)).toBe(true);
  });

  it("blocks a target master who does NOT perform the booking's service", () => {
    const cell = bookingToCell(makeRow({ serviceId: "svc-manicure" }));
    // A brow master (no manicure) → «· несовместим», disabled.
    expect(masterPerformsService(["svc-brows"], cell.serviceId)).toBe(false);
  });

  it("regression: the old `\"\"` placeholder blocked EVERY master (over-block)", () => {
    // Reproduce the pre-fix cell: serviceId "" → includes("") is false for any
    // real (cuid) serviceIds list, so no target master was ever selectable.
    const performingMaster = ["svc-manicure"];
    expect(masterPerformsService(performingMaster, "")).toBe(false);
    // After the fix the same performing master IS selectable:
    const cell = bookingToCell(makeRow({ serviceId: "svc-manicure" }));
    expect(masterPerformsService(performingMaster, cell.serviceId)).toBe(true);
  });

  it("package child row: each row carries its own single serviceId (no `\"\"`, no ambiguity)", () => {
    // A package is N independent child bookings, each a normal row with its own
    // gating service — the journal shows them as separate rows.
    const componentA = bookingToCell(makeRow({ id: "pkg-a", serviceId: "svc-manicure" }));
    const componentB = bookingToCell(makeRow({ id: "pkg-b", serviceId: "svc-pedicure" }));
    expect(componentA.serviceId).toBe("svc-manicure");
    expect(componentB.serviceId).toBe("svc-pedicure");
    expect(masterPerformsService(["svc-manicure"], componentA.serviceId)).toBe(true);
    expect(masterPerformsService(["svc-manicure"], componentB.serviceId)).toBe(false);
  });
});
