import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDIO-PAUSE-SPLIT-01 — пауза мастера в студии (`studioPaused`) отделена от
 * его личной видимости (`isPublished`).
 *
 *  1. Пауза из кабинета студии пишет `studioPaused` и НЕ трогает `isPublished`:
 *     личная страница мастера остаётся, он продолжает продавать свои услуги.
 *  2. `resolveBookingCore`: услугу СТУДИИ мастер на паузе не оказывает ни со
 *     своей страницы, ни через студию (раньше со стороны студии проверки не
 *     было вовсе); свою услугу — оказывает.
 *
 * @probe 2026-09-23 — (а) в `updateStudioMasterProfile` возвращена запись
 * `isPublished: input.isActive`: красный «пауза пишет studioPaused». (б) в
 * `resolveBookingCore` снята проверка `isStudioMasterActive(performer)`:
 * красные оба кейса «на паузе». Возвращено — зелёный.
 */

const providerFindUnique = vi.hoisted(() => vi.fn());
const providerFindFirst = vi.hoisted(() => vi.fn());
const providerUpdate = vi.hoisted(() => vi.fn(async () => ({ id: "m1" })));
const serviceFindUnique = vi.hoisted(() => vi.fn());
const masterServiceFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findUnique: providerFindUnique, findFirst: providerFindFirst, update: providerUpdate },
    service: { findUnique: serviceFindUnique },
    masterService: { findUnique: masterServiceFindUnique },
    studio: {
      findUnique: vi.fn(async () => ({ id: "studio-row", providerId: "studio-prov", provider: { timezone: "Europe/Moscow" } })),
      findFirst: vi.fn(async () => ({ id: "studio-row", providerId: "studio-prov", provider: { timezone: "Europe/Moscow" } })),
    },
  },
}));
vi.mock("@/lib/studio/team-limits", () => ({ ensureStudioTeamLimit: vi.fn() }));

import { resolveBookingCore } from "@/lib/bookings/booking-core";
import { updateStudioMasterProfile } from "@/lib/studio/masters.service";

const STUDIO_SERVICE = {
  id: "svc-studio",
  providerId: "studio-prov",
  title: null,
  name: "Педикюр",
  isEnabled: true,
  isActive: true,
  durationMin: 60,
  baseDurationMin: null,
  price: 200_000,
  basePrice: null,
};
const OWN_SERVICE = { ...STUDIO_SERVICE, id: "svc-own", providerId: "m1" };

function masterRow(studioPaused: boolean) {
  return {
    id: "m1",
    type: "MASTER",
    ownerUserId: "u-master",
    isPublished: true,
    studioPaused,
    timezone: "Europe/Moscow",
    studioId: "studio-prov",
    autoConfirmBookings: false,
    bufferBetweenBookingsMin: 0,
    minBookingHoursAhead: 0,
    maxBookingDaysAhead: 60,
    acceptNewClients: true,
    bufferBetweenBookingsMinNormalized: 0,
  };
}

function studioRow() {
  return {
    id: "studio-prov",
    type: "STUDIO",
    ownerUserId: "u-owner",
    isPublished: true,
    studioPaused: false,
    timezone: "Europe/Moscow",
    studioId: null,
    autoConfirmBookings: false,
    bufferBetweenBookingsMin: 0,
    minBookingHoursAhead: 0,
    maxBookingDaysAhead: 60,
    acceptNewClients: true,
  };
}

beforeEach(() => {
  providerFindUnique.mockReset();
  providerFindFirst.mockReset();
  providerUpdate.mockClear();
  serviceFindUnique.mockReset();
  masterServiceFindUnique.mockReset();
  masterServiceFindUnique.mockResolvedValue({ isEnabled: true, priceOverride: null, durationOverrideMin: null });
});

// Без `startAtUtc`/`slotLabel` ядро, пройдя проверки мастера и услуги, падает
// на дате — это и есть признак «проверка активности пройдена».
async function core(input: { providerId: string; serviceId: string; masterProviderId: string | null }) {
  return resolveBookingCore({ ...input, clientUserId: "u-client" });
}

describe("resolveBookingCore · мастер на паузе в студии", () => {
  // STUDIO-MASTER-PROFILES (решение владельца 2026-09-27): студийная услуга со
  // страницы мастера не оформляется вовсе — независимо от паузы (услуги
  // профилей не смешиваются). Раньше здесь был MASTER_NOT_ACTIVE, а у активного
  // мастера запись проходила и становилась ЛИЧНОЙ.
  it("со своей страницы — студийная услуга: отказ, запись только через студию", async () => {
    providerFindUnique.mockResolvedValue(masterRow(true));
    serviceFindUnique.mockResolvedValue(STUDIO_SERVICE);
    await expect(core({ providerId: "m1", serviceId: "svc-studio", masterProviderId: null })).rejects.toMatchObject({
      code: "SERVICE_NOT_BELONGS_TO_PROVIDER",
    });
  });

  it("активный мастер со своей страницы — студийная услуга тоже отказ", async () => {
    providerFindUnique.mockResolvedValue(masterRow(false));
    serviceFindUnique.mockResolvedValue(STUDIO_SERVICE);
    await expect(core({ providerId: "m1", serviceId: "svc-studio", masterProviderId: null })).rejects.toMatchObject({
      code: "SERVICE_NOT_BELONGS_TO_PROVIDER",
    });
  });

  it("через студию — отказ MASTER_NOT_ACTIVE (раньше проверки не было)", async () => {
    providerFindUnique.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === "studio-prov" ? studioRow() : masterRow(true),
    );
    serviceFindUnique.mockResolvedValue(STUDIO_SERVICE);
    await expect(
      core({ providerId: "studio-prov", serviceId: "svc-studio", masterProviderId: "m1" }),
    ).rejects.toMatchObject({ code: "MASTER_NOT_ACTIVE" });
  });

  it("своя услуга мастера на паузе — проверка активности не мешает", async () => {
    providerFindUnique.mockResolvedValue(masterRow(true));
    serviceFindUnique.mockResolvedValue(OWN_SERVICE);
    await expect(core({ providerId: "m1", serviceId: "svc-own", masterProviderId: null })).rejects.toMatchObject({
      code: "DATE_INVALID",
    });
  });

  it("активный мастер — студийная услуга проходит проверку", async () => {
    providerFindUnique.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === "studio-prov" ? studioRow() : masterRow(false),
    );
    serviceFindUnique.mockResolvedValue(STUDIO_SERVICE);
    await expect(
      core({ providerId: "studio-prov", serviceId: "svc-studio", masterProviderId: "m1" }),
    ).rejects.toMatchObject({ code: "DATE_INVALID" });
  });
});

describe("updateStudioMasterProfile · пауза", () => {
  it("пауза пишет studioPaused и не трогает личную видимость", async () => {
    providerFindFirst.mockResolvedValue({ id: "m1", ownerUserId: "u-master", studioPaused: false });
    await updateStudioMasterProfile({ studioId: "studio-row", masterId: "m1", isActive: false });
    const data = (providerUpdate.mock.calls.at(-1) as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).toMatchObject({ studioPaused: true });
    expect(data).not.toHaveProperty("isPublished");
  });

  it("снятие с паузы — studioPaused false", async () => {
    providerFindFirst.mockResolvedValue({ id: "m1", ownerUserId: "u-master", studioPaused: true });
    await updateStudioMasterProfile({ studioId: "studio-row", masterId: "m1", isActive: true });
    const data = (providerUpdate.mock.calls.at(-1) as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).toMatchObject({ studioPaused: false });
  });
});
