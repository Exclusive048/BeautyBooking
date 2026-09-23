import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDIO-HIDDEN-MASTER-SERVICES — решение владельца 2026-09-23: скрытая студия
 * (`isPublished = false`) записей не принимает. Её мастер принимает только
 * личные записи на СВОИ услуги. Отказ стоит в ядре записи с обеих сторон
 * (страница студии и страница мастера) и в ручной записи из кабинета студии.
 *
 * @probe 2026-09-23 — в `resolveBookingCore` снята проверка
 * `assertStudioAcceptsBookings` / `studioAcceptsBookings`: красные оба кейса
 * «студийная услуга скрытой студии». В `createStudioBooking` снят вызов
 * `assertStudioAcceptsBookings`: красный «ручная запись». Возвращено — зелёный.
 */

const providerFindUnique = vi.hoisted(() => vi.fn());
const serviceFindUnique = vi.hoisted(() => vi.fn());
const serviceFindFirst = vi.hoisted(() => vi.fn());
const masterServiceFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findUnique: providerFindUnique },
    service: { findUnique: serviceFindUnique, findFirst: serviceFindFirst },
    masterService: { findUnique: masterServiceFindUnique },
    studio: { findUnique: vi.fn(async () => ({ id: "studio-row", providerId: "studio-prov" })) },
  },
}));

import { resolveBookingCore } from "@/lib/bookings/booking-core";
import { createStudioBooking } from "@/lib/studio/bookings.service";

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

const POLICY = {
  timezone: "Europe/Moscow",
  autoConfirmBookings: false,
  bufferBetweenBookingsMin: 0,
  minBookingHoursAhead: 0,
  maxBookingDaysAhead: 60,
  acceptNewClients: true,
};
const MASTER = { id: "m1", type: "MASTER", ownerUserId: "u-master", isPublished: true, studioPaused: false, studioId: "studio-prov", ...POLICY };
const HIDDEN_STUDIO = { id: "studio-prov", type: "STUDIO", ownerUserId: "u-owner", isPublished: false, studioPaused: false, studioId: null, ...POLICY };

beforeEach(() => {
  providerFindUnique.mockReset();
  providerFindUnique.mockImplementation(async (args: { where: { id: string } }) =>
    args.where.id === "studio-prov" ? HIDDEN_STUDIO : MASTER,
  );
  serviceFindUnique.mockReset();
  serviceFindFirst.mockReset();
  masterServiceFindUnique.mockReset();
  masterServiceFindUnique.mockResolvedValue({ isEnabled: true, priceOverride: null, durationOverrideMin: null });
});

// Без `startAtUtc` ядро, пройдя проверки провайдера и услуги, падает на дате —
// признак «отказа по студии не было».
function core(input: { providerId: string; serviceId: string; masterProviderId: string | null }) {
  return resolveBookingCore({ ...input, clientUserId: "u-client" });
}

describe("скрытая студия записей не принимает", () => {
  it("студийная услуга скрытой студии со страницы мастера — отказ", async () => {
    serviceFindUnique.mockResolvedValue(STUDIO_SERVICE);
    await expect(core({ providerId: "m1", serviceId: "svc-studio", masterProviderId: null })).rejects.toMatchObject({
      status: 409,
      code: "STUDIO_NOT_ACCEPTING_BOOKINGS",
    });
  });

  it("студийная услуга скрытой студии со страницы студии — отказ", async () => {
    serviceFindUnique.mockResolvedValue(STUDIO_SERVICE);
    await expect(
      core({ providerId: "studio-prov", serviceId: "svc-studio", masterProviderId: "m1" }),
    ).rejects.toMatchObject({ code: "STUDIO_NOT_ACCEPTING_BOOKINGS" });
  });

  it("своя услуга мастера скрытой студии — личная запись проходит", async () => {
    serviceFindUnique.mockResolvedValue(OWN_SERVICE);
    await expect(core({ providerId: "m1", serviceId: "svc-own", masterProviderId: null })).rejects.toMatchObject({
      code: "DATE_INVALID",
    });
  });

  it("ручная запись из кабинета скрытой студии — действенный отказ", async () => {
    await expect(
      createStudioBooking({
        studioId: "studio-row",
        masterId: "m1",
        startAt: new Date("2026-10-01T09:00:00Z"),
        serviceId: "svc-studio",
        clientName: "Елена",
      }),
    ).rejects.toMatchObject({ code: "STUDIO_NOT_ACCEPTING_BOOKINGS", message: expect.stringContaining("Включите видимость") });
    expect(serviceFindFirst).not.toHaveBeenCalled();
  });
});
