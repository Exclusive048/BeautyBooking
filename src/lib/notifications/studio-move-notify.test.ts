import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-STUDIO-C (ops) — перенос записи администратором студии
 * (`notifyStudioBookingMoved`) уведомлял клиента, текущего и прежнего
 * мастера, но не остальную сторону студии: второй администратор и владелец
 * узнавали о переносе только из календаря. Теперь узнают все, кроме того, кто
 * перенёс, клиента и мастеров (им уже ушли свои тексты).
 */

type Delivered = { userId: string; title: string; body: string; type: string; pushUrl?: string };

const deliverNotification = vi.hoisted(() =>
  vi.fn<(input: Delivered) => Promise<undefined>>(async () => undefined),
);
const membershipFindMany = vi.hoisted(() =>
  vi.fn(async () => [{ userId: "studio-admin" }, { userId: "owner" }, { userId: "second-admin" }]),
);
const providerFindUnique = vi.hoisted(() =>
  vi.fn(async () => ({ ownerUserId: "olga", masterProfile: { userId: "olga" } })),
);

vi.mock("@/lib/notifications/delivery", () => ({ deliverNotification }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: vi.fn(async () => ({ id: "studio1" })) },
    studioMembership: { findMany: membershipFindMany },
    provider: { findUnique: providerFindUnique },
  },
}));

import { notifyStudioBookingMoved, type BookingWithRelations } from "@/lib/notifications/booking-notifications";

function studioBooking(): BookingWithRelations {
  return {
    id: "b1",
    status: "CONFIRMED",
    clientUserId: "client1",
    clientName: "Елена",
    startAtUtc: new Date("2026-10-06T09:00:00Z"),
    endAtUtc: new Date("2026-10-06T10:00:00Z"),
    proposedStartAt: null,
    actionRequiredBy: null,
    studioId: "studio1",
    providerId: "studio-prov",
    masterProviderId: "marina-prov",
    clientUser: { id: "client1" },
    provider: {
      id: "studio-prov",
      type: "STUDIO",
      studioId: null,
      name: "Vision",
      timezone: "Asia/Yekaterinburg",
      ownerUserId: "owner",
      masterProfile: null,
    },
    masterProvider: {
      id: "marina-prov",
      name: "Марина",
      ownerUserId: "marina",
      masterProfile: { userId: "marina" },
    },
    service: { id: "s1", name: "Маникюр", title: null },
  } as unknown as BookingWithRelations;
}

function delivered(): Delivered[] {
  return deliverNotification.mock.calls.map(([input]) => input);
}

beforeEach(() => {
  deliverNotification.mockClear();
});

describe("notifyStudioBookingMoved · сторона студии", () => {
  it("перенос по времени: остальные администраторы и владелец узнают, перенёсший — нет", async () => {
    await notifyStudioBookingMoved(
      studioBooking(),
      { previousMasterProviderId: "marina-prov", masterChanged: false, timeChanged: true },
      { actorUserId: "studio-admin" },
    );

    const toAdmins = delivered().filter((d) => d.body.startsWith("Администратор студии перенёс"));
    expect(toAdmins.map((d) => d.userId).sort()).toEqual(["owner", "second-admin"]);
    expect(toAdmins[0]).toMatchObject({ type: "BOOKING_RESCHEDULED", title: "Запись перенесена" });
    expect(toAdmins[0]!.body).toContain("Елена на Маникюр");
    expect(toAdmins[0]!.pushUrl).toContain("/cabinet/studio/calendar");
    // Клиенту и мастеру — свои тексты, по одному.
    expect(delivered().filter((d) => d.userId === "client1")).toHaveLength(1);
    expect(delivered().filter((d) => d.userId === "marina")).toHaveLength(1);
    expect(delivered().some((d) => d.userId === "studio-admin")).toBe(false);
  });

  it("смена мастера: прежний мастер получает своё, администраторам — с именем нового мастера", async () => {
    await notifyStudioBookingMoved(
      studioBooking(),
      { previousMasterProviderId: "olga-prov", masterChanged: true, timeChanged: false },
      { actorUserId: "owner" },
    );

    expect(delivered().filter((d) => d.userId === "olga")).toEqual([
      expect.objectContaining({ title: "Запись передана другому мастеру" }),
    ]);
    const toAdmins = delivered().filter((d) => d.body.startsWith("Администратор студии перенёс"));
    expect(toAdmins.map((d) => d.userId).sort()).toEqual(["second-admin", "studio-admin"]);
    expect(toAdmins[0]!.body).toContain("мастер Марина");
  });

  it("ничего не изменилось — администраторам не шлём", async () => {
    await notifyStudioBookingMoved(
      studioBooking(),
      { previousMasterProviderId: "marina-prov", masterChanged: false, timeChanged: false },
      { actorUserId: "studio-admin" },
    );

    expect(delivered().some((d) => d.body.startsWith("Администратор студии перенёс"))).toBe(false);
  });
});
