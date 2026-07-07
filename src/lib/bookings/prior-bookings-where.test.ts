import { describe, it, expect } from "vitest";
import { buildPriorBookingsWhere } from "@/lib/bookings/prior-bookings-where";

const STATUS_NOT_IN = ["REJECTED", "CANCELLED", "NO_SHOW"];

describe("buildPriorBookingsWhere — HARDENING-04 FIX-7", () => {
  it("no master chosen → provider-scoped, NO `OR`, and NEVER `{ masterProviderId: undefined }`", () => {
    const where = buildPriorBookingsWhere({
      clientUserId: "client-1",
      providerId: "studio-1",
      masterProviderId: null,
    });

    expect(where.clientUserId).toBe("client-1");
    expect(where.providerId).toBe("studio-1");
    // The bug: an OR carrying `{ masterProviderId: undefined }` → match-all.
    expect(where.OR).toBeUndefined();
    expect("masterProviderId" in where).toBe(false);
    expect(where.status).toEqual({ notIn: STATUS_NOT_IN });
  });

  it("master chosen → OR of THIS provider and THIS master", () => {
    const where = buildPriorBookingsWhere({
      clientUserId: "client-1",
      providerId: "studio-1",
      masterProviderId: "master-9",
    });

    expect(where.clientUserId).toBe("client-1");
    expect(where.OR).toEqual([{ providerId: "studio-1" }, { masterProviderId: "master-9" }]);
    // Provider scope moves into the OR — no bare top-level providerId to double it.
    expect(where.providerId).toBeUndefined();
    expect(where.status).toEqual({ notIn: STATUS_NOT_IN });
  });

  it("never serialises an undefined value inside the OR (regression pin)", () => {
    const withMaster = buildPriorBookingsWhere({
      clientUserId: "c",
      providerId: "p",
      masterProviderId: "m",
    });
    const serialised = JSON.stringify(withMaster);
    // `{ masterProviderId: undefined }` would drop the key on stringify AND in
    // Prisma → match-all. Assert the master clause survives with a real value.
    expect(serialised).toContain('"masterProviderId":"m"');

    const noMaster = buildPriorBookingsWhere({
      clientUserId: "c",
      providerId: "p",
      masterProviderId: null,
    });
    expect(JSON.stringify(noMaster)).not.toContain("masterProviderId");
  });
});
