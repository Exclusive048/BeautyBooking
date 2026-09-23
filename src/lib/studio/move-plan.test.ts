import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOVE-PICKER-DURATION — окошки для студийного переноса считаются ровно той
 * длиной, которую проверит `moveStudioBooking`: оба зовут
 * `planStudioMoveDuration`. Раньше пикер спрашивал окошки по одной услуге и её
 * длительности у мастера сейчас, а перенос к другому мастеру проверял сумму
 * его длительностей по ВСЕМ услугам записи — и отклонял предложенное время.
 *
 * @probe 2026-09-23 — в `planStudioMoveDuration` стратегия при смене мастера
 * оставлена `input.strategy` (KEEP → снимки): красный «к другому мастеру — сумма
 * его длительностей». В `resolveStudioMoveSlots` снята проверка студии мастера:
 * красный «мастер другой студии — 404». Возвращено — зелёный.
 */

const bookingFindUnique = vi.hoisted(() => vi.fn());
const studioFindUnique = vi.hoisted(() => vi.fn());
const providerFindUnique = vi.hoisted(() => vi.fn());
const masterServiceFindMany = vi.hoisted(() => vi.fn());
const requireProviderOwner = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findUnique: bookingFindUnique },
    studio: { findUnique: studioFindUnique },
    provider: { findUnique: providerFindUnique },
    masterService: { findMany: masterServiceFindMany },
  },
}));
vi.mock("@/lib/auth/access", () => ({ getSessionUser: vi.fn(async () => ({ userId: "u-admin", roles: ["STUDIO"] })) }));
vi.mock("@/lib/auth/ownership", () => ({ requireProviderOwner }));

import { AppError } from "@/lib/api/errors";
import { planStudioMoveDuration, resolveStudioMoveSlots } from "@/lib/studio/move-plan";

const REQ = new Request("http://localhost/api/masters/m-new/availability");
const ITEMS = [
  { serviceId: "svc-a", durationSnapshotMin: 60 },
  { serviceId: "svc-b", durationSnapshotMin: 30 },
];
// У нового мастера: A — своё переопределение 75 минут, B — базовые 45.
const NEW_MASTER_OVERRIDES = [
  { serviceId: "svc-a", isEnabled: true, priceOverride: null, durationOverrideMin: 75, service: { price: 1, durationMin: 60 } },
  { serviceId: "svc-b", isEnabled: true, priceOverride: null, durationOverrideMin: null, service: { price: 1, durationMin: 45 } },
];

beforeEach(() => {
  vi.clearAllMocks();
  masterServiceFindMany.mockResolvedValue(NEW_MASTER_OVERRIDES);
  requireProviderOwner.mockResolvedValue(undefined);
  bookingFindUnique.mockResolvedValue({ id: "bk1", studioId: "studio-row", masterProviderId: "m-old", serviceItems: ITEMS });
  studioFindUnique.mockResolvedValue({ providerId: "studio-prov" });
  providerFindUnique.mockResolvedValue({ studioId: "studio-prov" });
});

describe("planStudioMoveDuration", () => {
  it("к другому мастеру — сумма его длительностей по всем услугам записи", async () => {
    const plan = await planStudioMoveDuration({
      serviceItems: ITEMS,
      currentMasterId: "m-old",
      targetMasterId: "m-new",
      strategy: "KEEP_SERVICE",
    });
    expect(plan.masterChanged).toBe(true);
    expect(plan.windowMin).toBe(75 + 45);
  });

  it("у того же мастера — снимки записи", async () => {
    const plan = await planStudioMoveDuration({
      serviceItems: ITEMS,
      currentMasterId: "m-old",
      targetMasterId: "m-old",
      strategy: "KEEP_SERVICE",
    });
    expect(plan.masterChanged).toBe(false);
    expect(plan.windowMin).toBe(60 + 30);
  });
});

describe("resolveStudioMoveSlots · ?moveBookingId=", () => {
  it("без параметра — ничего и без обращения к записи", async () => {
    await expect(resolveStudioMoveSlots(REQ, "m-new", null)).resolves.toBeUndefined();
    expect(bookingFindUnique).not.toHaveBeenCalled();
  });

  it("к другому мастеру — его длина, окно записи не исключается", async () => {
    await expect(resolveStudioMoveSlots(REQ, "m-new", "bk1")).resolves.toEqual({
      excludeBookingId: undefined,
      durationMin: 120,
    });
    expect(requireProviderOwner).toHaveBeenCalledWith(expect.anything(), "studio-prov");
  });

  it("к тому же мастеру — снимки и без окна самой записи", async () => {
    await expect(resolveStudioMoveSlots(REQ, "m-old", "bk1")).resolves.toEqual({
      excludeBookingId: "bk1",
      durationMin: 90,
    });
  });

  it("мастер другой студии — 404", async () => {
    providerFindUnique.mockResolvedValue({ studioId: "other-studio-prov" });
    await expect(resolveStudioMoveSlots(REQ, "m-new", "bk1")).rejects.toMatchObject({ status: 404 });
  });

  it("не студийная запись (личная мастера) — 404", async () => {
    bookingFindUnique.mockResolvedValue({ id: "bk1", studioId: null, masterProviderId: "m-old", serviceItems: ITEMS });
    await expect(resolveStudioMoveSlots(REQ, "m-new", "bk1")).rejects.toMatchObject({ status: 404 });
  });

  it("не владелец и не админ студии — 403", async () => {
    requireProviderOwner.mockRejectedValue(new AppError("Недостаточно прав.", 403, "FORBIDDEN"));
    await expect(resolveStudioMoveSlots(REQ, "m-new", "bk1")).rejects.toMatchObject({ status: 403 });
  });
});
