import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SECURITY-EXPOSURE-AUDIT-01 finding #1 — the shared cross-tenant assertion.
 * These are the NEGATIVE cases the cluster shipped without: a foreign or solo
 * (null-studioId) entity must be rejected 404, so no cross-tenant write can
 * reach the mutation. The positive cases confirm a studio's own entity passes.
 */

const { studioFindUnique, providerFindFirst, serviceFindFirst, bookingFindFirst } = vi.hoisted(() => ({
  studioFindUnique: vi.fn(),
  providerFindFirst: vi.fn(),
  serviceFindFirst: vi.fn(),
  bookingFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: studioFindUnique },
    provider: { findFirst: providerFindFirst },
    service: { findFirst: serviceFindFirst },
    booking: { findFirst: bookingFindFirst },
  },
}));

import { assertBelongsToStudio } from "@/lib/studio/tenancy";

const STUDIO_ID = "studio-1";
const STUDIO_PROVIDER_ID = "studio-provider-1";

beforeEach(() => {
  studioFindUnique.mockReset();
  providerFindFirst.mockReset();
  serviceFindFirst.mockReset();
  bookingFindFirst.mockReset();
  studioFindUnique.mockResolvedValue({ providerId: STUDIO_PROVIDER_ID });
});

describe("assertBelongsToStudio — master", () => {
  it("accepts a master that belongs to the studio (query scoped to studio.providerId)", async () => {
    providerFindFirst.mockResolvedValue({ id: "master-1" });
    await expect(assertBelongsToStudio("master", "master-1", STUDIO_ID)).resolves.toBe("master-1");
    // The scoping lives IN the where clause — provider.studioId maps to the
    // studio's PROVIDER id, not Studio.id.
    expect(providerFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "master-1", type: "MASTER", studioId: STUDIO_PROVIDER_ID }),
      })
    );
  });

  it("rejects a foreign / solo master (findFirst returns null) with 404", async () => {
    providerFindFirst.mockResolvedValue(null);
    await expect(assertBelongsToStudio("master", "foreign-master", STUDIO_ID)).rejects.toMatchObject({
      status: 404,
      code: "MASTER_NOT_FOUND",
    });
  });

  it("404s when the studio itself is missing (never reaches the master query)", async () => {
    studioFindUnique.mockResolvedValue(null);
    await expect(assertBelongsToStudio("master", "m", STUDIO_ID)).rejects.toMatchObject({
      status: 404,
      code: "STUDIO_NOT_FOUND",
    });
    expect(providerFindFirst).not.toHaveBeenCalled();
  });
});

describe("assertBelongsToStudio — service", () => {
  it("accepts a studio's own service (scoped by Studio.id)", async () => {
    serviceFindFirst.mockResolvedValue({ id: "svc-1" });
    await expect(assertBelongsToStudio("service", "svc-1", STUDIO_ID)).resolves.toBe("svc-1");
    expect(serviceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "svc-1", studioId: STUDIO_ID }) })
    );
  });

  it("rejects a foreign / solo service (studioId null → not found) with 404", async () => {
    serviceFindFirst.mockResolvedValue(null);
    await expect(assertBelongsToStudio("service", "foreign-svc", STUDIO_ID)).rejects.toMatchObject({
      status: 404,
      code: "SERVICE_NOT_FOUND",
    });
  });
});

describe("assertBelongsToStudio — booking", () => {
  it("accepts a studio's own booking (scoped by Studio.id)", async () => {
    bookingFindFirst.mockResolvedValue({ id: "bk-1" });
    await expect(assertBelongsToStudio("booking", "bk-1", STUDIO_ID)).resolves.toBe("bk-1");
    expect(bookingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "bk-1", studioId: STUDIO_ID }) })
    );
  });

  it("rejects a solo-master booking (studioId null → not found) with 404 — closes R1d", async () => {
    bookingFindFirst.mockResolvedValue(null);
    await expect(assertBelongsToStudio("booking", "solo-booking", STUDIO_ID)).rejects.toMatchObject({
      status: 404,
      code: "BOOKING_NOT_FOUND",
    });
  });
});
