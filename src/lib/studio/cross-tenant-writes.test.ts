import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SECURITY-EXPOSURE-AUDIT-01 finding #1 — per-write NEGATIVE tests. Each fixed
 * function must route its caller-supplied entity id through the shared
 * `assertBelongsToStudio`, and when that assertion rejects (a foreign / solo
 * entity), NO write may occur. This is the class of test the cluster shipped
 * without (positive-only). `assertBelongsToStudio` itself is tested in
 * `tenancy.test.ts`; here it is mocked to isolate the wiring.
 */

const tenancy = vi.hoisted(() => ({ assertBelongsToStudio: vi.fn() }));
const prismaMock = vi.hoisted(() => ({
  timeBlock: { create: vi.fn() },
  masterService: { upsert: vi.fn(), updateMany: vi.fn() },
  booking: { findUnique: vi.fn(), update: vi.fn() },
  studio: { findUnique: vi.fn() },
  provider: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/studio/tenancy", () => tenancy);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/schedule/slotsCache", () => ({ invalidateSlotsForMaster: vi.fn() }));
vi.mock("@/lib/studio/master-eligibility", () => ({ requireActiveStudioMaster: vi.fn() }));

import { createStudioBlock } from "@/lib/studio/calendar.service";
import { bulkUpdateMasterServices } from "@/lib/studio/masters.service";
import { assignMasterToService, unassignMasterFromService } from "@/lib/studio/services.service";
import { moveStudioBooking } from "@/lib/studio/bookings.service";

const DENY = () => {
  const err = Object.assign(new Error("Master not found"), { status: 404, code: "MASTER_NOT_FOUND" });
  throw err;
};

beforeEach(() => {
  vi.clearAllMocks();
  tenancy.assertBelongsToStudio.mockResolvedValue("ok");
});

describe("R1a createStudioBlock", () => {
  const input = {
    studioId: "s1",
    masterId: "foreign-master",
    startAt: new Date("2026-08-01T09:00:00Z"),
    endAt: new Date("2026-08-01T10:00:00Z"),
    type: "BLOCK" as const,
  };

  it("scopes the master to the studio before creating a block", async () => {
    prismaMock.timeBlock.create.mockResolvedValue({ id: "b", masterId: "m", startAt: input.startAt, endAt: input.endAt, type: "BLOCK", note: null });
    await createStudioBlock(input);
    expect(tenancy.assertBelongsToStudio).toHaveBeenCalledWith("master", "foreign-master", "s1");
  });

  it("does NOT create a block when the master is foreign (assertion rejects)", async () => {
    tenancy.assertBelongsToStudio.mockImplementation(DENY);
    await expect(createStudioBlock(input)).rejects.toMatchObject({ code: "MASTER_NOT_FOUND" });
    expect(prismaMock.timeBlock.create).not.toHaveBeenCalled();
  });
});

describe("R1c bulkUpdateMasterServices", () => {
  const input = {
    studioId: "s1",
    masterId: "foreign-master",
    items: [{ serviceId: "svc-1", isEnabled: false, priceOverride: 0 }],
  };

  it("scopes both the master and each service to the studio", async () => {
    prismaMock.$transaction.mockResolvedValue([]);
    await bulkUpdateMasterServices(input);
    expect(tenancy.assertBelongsToStudio).toHaveBeenCalledWith("master", "foreign-master", "s1");
    expect(tenancy.assertBelongsToStudio).toHaveBeenCalledWith("service", "svc-1", "s1");
  });

  it("does NOT write when the master is foreign", async () => {
    tenancy.assertBelongsToStudio.mockImplementation(DENY);
    await expect(bulkUpdateMasterServices(input)).rejects.toMatchObject({ code: "MASTER_NOT_FOUND" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("R1e assign / unassign master to service", () => {
  it("assign scopes the service and does NOT upsert when it is foreign", async () => {
    tenancy.assertBelongsToStudio.mockImplementation(DENY);
    await expect(
      assignMasterToService({ studioId: "s1", serviceId: "foreign-svc", masterId: "m" })
    ).rejects.toMatchObject({ code: "MASTER_NOT_FOUND" });
    expect(prismaMock.masterService.upsert).not.toHaveBeenCalled();
  });

  it("unassign scopes BOTH service and master and does NOT write when foreign", async () => {
    tenancy.assertBelongsToStudio.mockImplementation(DENY);
    await expect(
      unassignMasterFromService({ studioId: "s1", serviceId: "foreign-svc", masterId: "m" })
    ).rejects.toMatchObject({ code: "MASTER_NOT_FOUND" });
    expect(prismaMock.masterService.updateMany).not.toHaveBeenCalled();
  });

  it("unassign asserts service THEN master (both scoped)", async () => {
    prismaMock.masterService.updateMany.mockResolvedValue({ count: 1 });
    await unassignMasterFromService({ studioId: "s1", serviceId: "svc-1", masterId: "m1" });
    expect(tenancy.assertBelongsToStudio).toHaveBeenCalledWith("service", "svc-1", "s1");
    expect(tenancy.assertBelongsToStudio).toHaveBeenCalledWith("master", "m1", "s1");
  });
});

describe("R1d moveStudioBooking", () => {
  const input = {
    studioId: "s1",
    bookingId: "solo-booking",
    targetMasterId: "m",
    targetStartAt: new Date("2026-08-05T09:00:00Z"),
    strategy: "KEEP_SERVICE" as const,
    pricing: "KEEP_PRICE" as const,
  };

  it("does NOT move a booking that isn't the studio's (null / foreign studioId)", async () => {
    // The booking row exists (null studioId = a solo master's booking) and the
    // old null-permissive guard would have let it through; the assertion rejects.
    prismaMock.booking.findUnique.mockResolvedValue({ id: "solo-booking", studioId: null, serviceItems: [] });
    tenancy.assertBelongsToStudio.mockImplementation(DENY);
    await expect(moveStudioBooking(input)).rejects.toBeTruthy();
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(tenancy.assertBelongsToStudio).toHaveBeenCalledWith("booking", "solo-booking", "s1");
  });
});
