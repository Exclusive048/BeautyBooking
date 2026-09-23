import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, ProviderType } from "@prisma/client";

/**
 * STUDIO-MASTER-OWN-BOOKINGS-01 — студия управляет ТОЛЬКО бронями своей
 * поверхности (`Booking.studioId`, инв. #45), а не всеми бронями своего мастера.
 *
 * Мастер студии принимает записи и сам — с личной страницы, на свои услуги;
 * такая бронь получает `studioId = null`. Раньше право администратора студии
 * выводилось из ЧЛЕНСТВА мастера (`provider.studioId`), поэтому админ мог
 * подтверждать, отменять и переносить личные записи мастера.
 *
 * @probe 2026-09-23 — в `requireBookingConfirmAccess` возвращён вывод студии из
 * членства мастера (`resolveStudioIdForProvider(booking.provider)`): красный
 * «личная запись мастера студии → администратор студии не допускается»
 * (получено actor MASTER вместо FORBIDDEN). Возвращено — зелёный.
 */

const bookingFindUnique = vi.hoisted(() => vi.fn());
const membershipFindFirst = vi.hoisted(() => vi.fn());
const studioFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findUnique: bookingFindUnique },
    studioMembership: { findFirst: membershipFindFirst },
    studio: { findUnique: studioFindUnique },
  },
}));

import { requireBookingConfirmAccess } from "@/lib/auth/ownership";

const STUDIO_ID = "studio-1";
const STUDIO_ADMIN = { userId: "admin-user", roles: [AccountType.CLIENT, AccountType.STUDIO] } as never;

function booking(studioId: string | null) {
  return {
    id: "b1",
    clientUserId: "client-user",
    studioId,
    provider: { id: "master-provider", type: ProviderType.MASTER, ownerUserId: "master-user", studioId: "studio-provider" },
    masterProvider: { ownerUserId: "master-user" },
  };
}

beforeEach(() => {
  bookingFindUnique.mockReset();
  membershipFindFirst.mockReset();
  studioFindUnique.mockReset();
  // Админ студии STUDIO_ID; студия мастера по членству — та же.
  membershipFindFirst.mockImplementation(async ({ where }: { where: { studioId: string } }) =>
    where.studioId === STUDIO_ID ? { id: "m1" } : null,
  );
  studioFindUnique.mockResolvedValue({ id: STUDIO_ID });
});

describe("requireBookingConfirmAccess · поверхность брони решает за студию", () => {
  it("запись через студию → администратор студии допускается", async () => {
    bookingFindUnique.mockResolvedValue(booking(STUDIO_ID));
    await expect(requireBookingConfirmAccess(STUDIO_ADMIN, "b1")).resolves.toEqual({ actor: "MASTER" });
  });

  it("личная запись мастера студии → администратор студии не допускается", async () => {
    bookingFindUnique.mockResolvedValue(booking(null));
    await expect(requireBookingConfirmAccess(STUDIO_ADMIN, "b1")).rejects.toMatchObject({ status: 403 });
  });

  it("сам мастер свою личную запись подтверждает", async () => {
    bookingFindUnique.mockResolvedValue(booking(null));
    await expect(
      requireBookingConfirmAccess({ userId: "master-user", roles: [AccountType.MASTER] } as never, "b1"),
    ).resolves.toEqual({ actor: "MASTER" });
  });
});
