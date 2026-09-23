import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDIO-MASTER-OWN-BOOKINGS-01 × инв. #45 — о записи с личной страницы мастера
 * студии (`studioId = null`) студия не узнаёт: её администраторам не уходят ни
 * «У вас новая запись», ни перенос, ни отмена — с именем клиента, услугой и
 * временем. Студия выводится из поверхности записи, а не из членства мастера.
 *
 * @probe 2026-09-23 — в `resolveStudioIdForBooking` возвращён откат на
 *        `provider.studioId`: красный «личная запись мастера студии…»
 *        (уведомление ушло и админу студии). Возвращено — зелёный.
 */

const deliverNotification = vi.hoisted(() =>
  vi.fn<(input: { userId: string }) => Promise<undefined>>(async () => undefined),
);
const studioFindUnique = vi.hoisted(() =>
  vi.fn<(args: { where: { providerId: string } }) => Promise<{ id: string }>>(async () => ({ id: "studio1" })),
);
const membershipFindMany = vi.hoisted(() => vi.fn(async () => [{ userId: "studio-admin" }]));

vi.mock("@/lib/notifications/delivery", () => ({ deliverNotification }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: studioFindUnique },
    studioMembership: { findMany: membershipFindMany },
  },
}));

import { notifyBookingCreated, type BookingWithRelations } from "@/lib/notifications/booking-notifications";

function booking(patch: Partial<BookingWithRelations>): BookingWithRelations {
  return {
    id: "b1",
    status: "PENDING",
    clientUserId: "client1",
    clientName: "Елена",
    startAtUtc: new Date("2026-10-01T09:00:00Z"),
    endAtUtc: new Date("2026-10-01T10:00:00Z"),
    studioId: null,
    clientUser: { id: "client1" },
    provider: {
      id: "master-prov",
      type: "MASTER",
      studioId: "studio-prov",
      name: "Марина",
      timezone: "Asia/Yekaterinburg",
      ownerUserId: "marina",
      masterProfile: { userId: "marina" },
    },
    masterProvider: null,
    service: { id: "s1", name: "Маникюр", title: null },
    ...patch,
  } as unknown as BookingWithRelations;
}

function recipients(): string[] {
  return deliverNotification.mock.calls.map(([input]) => input.userId).sort();
}

beforeEach(() => {
  deliverNotification.mockClear();
  studioFindUnique.mockClear();
});

describe("получатели уведомления о записи — студия из поверхности", () => {
  it("личная запись мастера студии уходит только мастеру", async () => {
    await notifyBookingCreated(booking({}));
    expect(recipients()).toEqual(["marina"]);
  });

  it("запись через студию уходит и администраторам студии", async () => {
    await notifyBookingCreated(booking({ studioId: "studio1" }));
    expect(recipients()).toEqual(["marina", "studio-admin"]);
  });
});
