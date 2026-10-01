import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * NOTIFY-STUDIO-ADMIN-BOOKING-ACTIONS (2026-09-24) — отмена или отказ со
 * стороны провайдера уведомляли только клиента. Администратор студии отменял
 * запись — её мастер не узнавал и ждал клиента; мастер отменял студийную
 * запись — не узнавали администраторы. Теперь узнаёт вся сторона провайдера,
 * кроме того, кто нажал, а клиенту отмену администратора не приписывают мастеру.
 *
 * @probe 2026-09-24 — из фильтра получателей `notifyProviderSideCancelled`
 *        убрано `userId !== input.actorUserId`: красные все четыре кейса
 *        первого блока (отменивший получал уведомление о собственном
 *        действии, у соло-мастера — о своей же отмене). Возвращено — зелёный.
 * @probe 2026-09-24 — `isCancelledByStudioSide` возвращает `false` всегда:
 *        красный «клиенту — «отменена студией»». Возвращено — зелёный.
 */

type Delivered = { userId: string; title: string; body: string; type: string };

const deliverNotification = vi.hoisted(() =>
  vi.fn<(input: Delivered) => Promise<undefined>>(async () => undefined),
);
const studioFindUnique = vi.hoisted(() => vi.fn(async () => ({ id: "studio1" })));
const membershipFindMany = vi.hoisted(() =>
  vi.fn(async () => [{ userId: "studio-admin" }, { userId: "owner" }]),
);

vi.mock("@/lib/notifications/delivery", () => ({ deliverNotification }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: studioFindUnique },
    studioMembership: { findMany: membershipFindMany },
  },
}));

import {
  notifyCancelledByMaster,
  notifyProviderSideCancelled,
  type BookingWithRelations,
} from "@/lib/notifications/booking-notifications";

function studioBooking(patch: Partial<BookingWithRelations> = {}): BookingWithRelations {
  return {
    id: "b1",
    status: "REJECTED",
    clientUserId: "client1",
    clientName: "Елена",
    startAtUtc: new Date("2026-10-01T09:00:00Z"),
    endAtUtc: new Date("2026-10-01T10:00:00Z"),
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
    ...patch,
  } as unknown as BookingWithRelations;
}

function soloBooking(): BookingWithRelations {
  return studioBooking({
    studioId: null,
    providerId: "anna-prov",
    masterProviderId: null,
    provider: {
      id: "anna-prov",
      type: "MASTER",
      studioId: null,
      name: "Анна",
      timezone: "Europe/Moscow",
      ownerUserId: "anna",
      masterProfile: { userId: "anna" },
    },
    masterProvider: null,
  } as unknown as Partial<BookingWithRelations>);
}

function delivered(): Delivered[] {
  return deliverNotification.mock.calls.map(([input]) => input);
}

function recipients(): string[] {
  return delivered()
    .map((d) => d.userId)
    .sort();
}

beforeEach(() => {
  deliverNotification.mockClear();
});

describe("NOTIFY-STUDIO-ADMIN-BOOKING-ACTIONS · сторона провайдера узнаёт об отмене", () => {
  it("администратор отменил — узнают мастер и владелец, но не он сам и не клиент", async () => {
    const sent = await notifyProviderSideCancelled(studioBooking(), {
      actorUserId: "studio-admin",
      kind: "CANCELLED",
    });
    expect(recipients()).toEqual(["marina", "owner"]);
    expect(sent.sort()).toEqual(["marina", "owner"]);
    expect(delivered()[0]!.type).toBe("BOOKING_CANCELLED");
    expect(delivered()[0]!.body).toContain("Администратор студии отменил запись Елена на Маникюр");
  });

  it("мастер отклонил — узнают администраторы, мастер себе не шлёт", async () => {
    await notifyProviderSideCancelled(studioBooking(), { actorUserId: "marina", kind: "REJECTED" });
    expect(recipients()).toEqual(["owner", "studio-admin"]);
    expect(delivered()[0]!.title).toBe("Запись отклонена");
    expect(delivered()[0]!.body).toContain("Мастер Марина отклонил");
  });

  it("у соло-мастера после вычета отменившего адресатов нет", async () => {
    const sent = await notifyProviderSideCancelled(soloBooking(), { actorUserId: "anna", kind: "CANCELLED" });
    expect(sent).toEqual([]);
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it("уже уведомлённых не повторяет (пакет — одно уведомление администраторам)", async () => {
    await notifyProviderSideCancelled(studioBooking(), {
      actorUserId: "marina",
      kind: "CANCELLED",
      excludeUserIds: new Set(["owner", "studio-admin"]),
    });
    expect(deliverNotification).not.toHaveBeenCalled();
  });
});

describe("NOTIFY-STUDIO-ADMIN-BOOKING-ACTIONS · клиенту не приписывают отмену мастеру", () => {
  it("клиенту — «отменена студией», если отменил администратор", async () => {
    await notifyCancelledByMaster(studioBooking(), { actorUserId: "studio-admin" });
    expect(recipients()).toEqual(["client1"]);
    expect(delivered()[0]!.title).toBe("Запись отменена студией");
    expect(delivered()[0]!.body).toContain("Студия «Vision» отменила");
  });

  it("клиенту — «отменена мастером», если отменил сам мастер", async () => {
    await notifyCancelledByMaster(studioBooking(), { actorUserId: "marina" });
    expect(delivered()[0]!.title).toBe("Запись отменена мастером");
  });
});

describe("DEV-SCENARIO-01 · причина отмены доходит до клиента", () => {
  it("причина мастера — в тексте уведомления", async () => {
    await notifyCancelledByMaster(
      studioBooking({ cancelReason: "Заболела, переношу на следующую неделю" } as Partial<BookingWithRelations>),
      { actorUserId: "marina" },
    );
    expect(delivered()[0]!.body).toContain("Причина: Заболела, переношу на следующую неделю");
  });

  it("без причины — без хвоста", async () => {
    await notifyCancelledByMaster(studioBooking(), { actorUserId: "marina" });
    expect(delivered()[0]!.body).not.toContain("Причина");
  });
});
