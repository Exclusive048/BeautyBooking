import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-CLIENT-01 — «Мои записи» и карточка одной записи.
 *
 *  · G1: `getClientBooking` ищет запись ТОЛЬКО среди своих (`clientUserId` в
 *    `where`) и отдаёт ровно элемент списка (один маппер).
 *  · G3/G4: новые поля DTO и их правила показа.
 *  · B2: адрес студийной записи — адрес студии, а не `""` от профиля мастера.
 *  · B3: слаг переписки — по записанному провайдеру и только у записи к мастеру.
 *
 * @probe 2026-10-03 — в маппере адрес возвращён к
 *        `displayProvider.address ?? r.provider.address ?? null`: 3 красных
 *        «адрес визита (B2)» (`expected '' to be 'г. Казань, ул. Баумана, 5'`).
 *        Возвращено — 15/15.
 * @probe 2026-10-03 — прежняя логика слага (создаётся по любому `providerId`,
 *        ищется по `displayProvider.id`): 2 красных — «студийная запись — без
 *        чата…» (`expected 'slug-studio-1' to be null`: студийная запись без
 *        мастера вела в переписку, которой нет в списках) и «список: один слаг
 *        на мастера…» (слаг студии создан). Возвращено — 15/15.
 * @probe 2026-10-03 — из `where` `getClientBooking` убран `clientUserId`:
 *        покраснел «ищет только среди записей вызывающего». Возвращено — 15/15.
 */

const bookingFindMany = vi.hoisted(() => vi.fn());
const bookingFindFirst = vi.hoisted(() => vi.fn());
const getOrCreateConversationSlug = vi.hoisted(() =>
  vi.fn(async ({ providerId }: { providerId: string }) => `slug-${providerId}`),
);

vi.mock("@/lib/prisma", () => ({
  prisma: { booking: { findMany: bookingFindMany, findFirst: bookingFindFirst } },
}));
vi.mock("@/lib/chat/conversation-slug", () => ({ getOrCreateConversationSlug }));

import { getClientBooking, listClientBookings } from "./bookings.service";

const NOW = new Date("2026-10-03T09:00:00Z");
const USER = "client-1";

type ProviderRow = {
  id: string;
  name: string;
  publicUsername: string | null;
  type: "MASTER" | "STUDIO";
  avatarUrl: string | null;
  address: string;
  timezone: string;
  cancellationDeadlineHours: number | null;
};

function provider(overrides: Partial<ProviderRow> = {}): ProviderRow {
  return {
    id: "master-1",
    name: "Анна",
    publicUsername: "anna",
    type: "MASTER",
    avatarUrl: "/api/media/file/a1",
    address: "г. Москва, ул. Ленина, 1",
    timezone: "Europe/Moscow",
    cancellationDeadlineHours: null,
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  const solo = provider();
  return {
    id: "bk-1",
    status: "CONFIRMED",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    startAtUtc: new Date("2026-10-10T10:00:00Z"),
    endAtUtc: new Date("2026-10-10T11:00:00Z"),
    proposedStartAt: null,
    proposedEndAt: null,
    actionRequiredBy: null,
    changeComment: null,
    clientChangeRequestsCount: 0,
    bookingPackageId: null,
    cancelledBy: null,
    cancelReason: null,
    comment: null,
    silentMode: false,
    slotLabel: "10 окт 13:00",
    providerId: solo.id,
    service: { id: "svc-1", name: "Маникюр", price: 150000, durationMin: 60 },
    provider: solo,
    masterProvider: solo,
    serviceItems: [{ titleSnapshot: "Маникюр", priceSnapshot: 150000, durationSnapshotMin: 60 }],
    review: null,
    ...overrides,
  };
}

function studioRow(overrides: Record<string, unknown> = {}) {
  const studio = provider({
    id: "studio-1",
    name: "Студия «Лак»",
    publicUsername: "lak",
    type: "STUDIO",
    avatarUrl: null,
    address: "г. Казань, ул. Баумана, 5",
    cancellationDeadlineHours: 12,
  });
  const inStudioMaster = provider({ id: "studio-master-1", publicUsername: null, address: "" });
  return row({ providerId: studio.id, provider: studio, masterProvider: inStudioMaster, ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe("getClientBooking", () => {
  it("ищет только среди записей вызывающего", async () => {
    bookingFindFirst.mockResolvedValue(null);
    await expect(getClientBooking(USER, "bk-foreign")).resolves.toBeNull();
    expect(bookingFindFirst.mock.calls[0]?.[0]?.where).toEqual({ id: "bk-foreign", clientUserId: USER });
  });

  it("форма — ровно элемент списка", async () => {
    const r = studioRow();
    bookingFindFirst.mockResolvedValue(r);
    bookingFindMany.mockResolvedValue([r]);
    const single = await getClientBooking(USER, r.id);
    const list = await listClientBookings(USER);
    expect(single).toEqual(list.bookings[0]);
    // Та же выборка у обоих путей.
    expect(bookingFindFirst.mock.calls[0]?.[0]?.select).toEqual(bookingFindMany.mock.calls[0]?.[0]?.select);
  });
});

describe("адрес визита (B2)", () => {
  it("студийная запись: адрес студии вместо пустого адреса профиля мастера, «Маршрут» есть", async () => {
    bookingFindFirst.mockResolvedValue(studioRow());
    const dto = await getClientBooking(USER, "bk-1");
    expect(dto?.address).toBe("г. Казань, ул. Баумана, 5");
    expect(dto?.isOnSite).toBe(true);
  });

  it("свой адрес мастера главнее адреса студии; пробелы обрезаются", async () => {
    bookingFindFirst.mockResolvedValue(
      studioRow({ masterProvider: provider({ id: "studio-master-1", address: "  ул. Пушкина, 3 " }) }),
    );
    expect((await getClientBooking(USER, "bk-1"))?.address).toBe("ул. Пушкина, 3");
  });

  it("пустые адреса — null, «Маршрута» нет", async () => {
    const empty = provider({ address: "   " });
    bookingFindFirst.mockResolvedValue(row({ provider: empty, masterProvider: empty }));
    const dto = await getClientBooking(USER, "bk-1");
    expect(dto?.address).toBeNull();
    expect(dto?.isOnSite).toBe(false);
  });
});

describe("чат (B3)", () => {
  it("запись к мастеру — слаг по записанному провайдеру", async () => {
    bookingFindFirst.mockResolvedValue(row());
    const dto = await getClientBooking(USER, "bk-1");
    expect(getOrCreateConversationSlug).toHaveBeenCalledWith({ providerId: "master-1", clientUserId: USER });
    expect(dto?.chatSlug).toBe("slug-master-1");
  });

  it("студийная запись — без чата и без строки слага (мессенджер студий не показывает)", async () => {
    bookingFindFirst.mockResolvedValue(studioRow());
    expect((await getClientBooking(USER, "bk-1"))?.chatSlug).toBeNull();
    bookingFindFirst.mockResolvedValue(studioRow({ masterProvider: null }));
    expect((await getClientBooking(USER, "bk-1"))?.chatSlug).toBeNull();
    expect(getOrCreateConversationSlug).not.toHaveBeenCalled();
  });

  it("список: один слаг на мастера, студийные записи слаг не создают", async () => {
    bookingFindMany.mockResolvedValue([row({ id: "a" }), row({ id: "b" }), studioRow({ id: "c" })]);
    const { bookings } = await listClientBookings(USER);
    expect(getOrCreateConversationSlug).toHaveBeenCalledTimes(1);
    expect(bookings.map((b) => b.chatSlug)).toEqual(["slug-master-1", "slug-master-1", null]);
  });
});

describe("студия (G4)", () => {
  it("студийная запись с мастером — студия рядом с мастером", async () => {
    bookingFindFirst.mockResolvedValue(studioRow());
    const dto = await getClientBooking(USER, "bk-1");
    expect(dto?.provider.id).toBe("studio-master-1");
    expect(dto?.studio).toEqual({
      id: "studio-1",
      name: "Студия «Лак»",
      publicUsername: "lak",
      address: "г. Казань, ул. Баумана, 5",
    });
  });

  it("запись к мастеру и студийная без мастера — studio: null", async () => {
    bookingFindFirst.mockResolvedValue(row());
    expect((await getClientBooking(USER, "bk-1"))?.studio).toBeNull();
    bookingFindFirst.mockResolvedValue(studioRow({ masterProvider: null }));
    const dto = await getClientBooking(USER, "bk-1");
    expect(dto?.studio).toBeNull();
    expect(dto?.provider.id).toBe("studio-1");
  });
});

describe("новые поля (G3)", () => {
  it("создание, комментарий, «помолчать», счётчик переносов и предел", async () => {
    bookingFindFirst.mockResolvedValue(
      row({ comment: "  Аллергия на лак  ", silentMode: true, clientChangeRequestsCount: 2 }),
    );
    const dto = await getClientBooking(USER, "bk-1");
    expect(dto).toMatchObject({
      createdAt: "2026-10-01T10:00:00.000Z",
      comment: "Аллергия на лак",
      silentMode: true,
      clientChangeRequestsCount: 2,
      changeRequestLimit: 3,
    });
  });

  it("комментарий мастера к переносу — только при CHANGE_REQUESTED", async () => {
    bookingFindFirst.mockResolvedValue(
      row({
        status: "CHANGE_REQUESTED",
        proposedStartAt: new Date("2026-10-11T10:00:00Z"),
        proposedEndAt: new Date("2026-10-11T11:00:00Z"),
        actionRequiredBy: "CLIENT",
        changeComment: "Могу на час позже",
      }),
    );
    expect((await getClientBooking(USER, "bk-1"))?.changeComment).toBe("Могу на час позже");

    bookingFindFirst.mockResolvedValue(row({ changeComment: "старый" }));
    expect((await getClientBooking(USER, "bk-1"))?.changeComment).toBeNull();
  });

  it("кто отменил — только у отменённой записи", async () => {
    bookingFindFirst.mockResolvedValue(row({ status: "REJECTED", cancelledBy: "SYSTEM" }));
    expect((await getClientBooking(USER, "bk-1"))?.cancelledBy).toBe("SYSTEM");
    bookingFindFirst.mockResolvedValue(row({ status: "CONFIRMED", cancelledBy: "CLIENT" }));
    expect((await getClientBooking(USER, "bk-1"))?.cancelledBy).toBeNull();
  });

  it("срок отмены — записанного провайдера (у студийной — студии), ≤ 0 — null", async () => {
    bookingFindFirst.mockResolvedValue(studioRow());
    expect((await getClientBooking(USER, "bk-1"))?.cancellationDeadlineHours).toBe(12);
    bookingFindFirst.mockResolvedValue(row({ provider: provider({ cancellationDeadlineHours: 0 }) }));
    expect((await getClientBooking(USER, "bk-1"))?.cancellationDeadlineHours).toBeNull();
  });

  it("конец окна отзыва: будущая и завершённая запись — есть; отзыв есть, окно прошло, отмена — null", async () => {
    // Визит 10.10 10:00–11:00 → окно открывается в 12:00 (час грейса), закрывается через 3 дня.
    bookingFindFirst.mockResolvedValue(row());
    expect((await getClientBooking(USER, "bk-1"))?.reviewDeadlineUtc).toBe("2026-10-13T12:00:00.000Z");

    const finished = {
      startAtUtc: new Date("2026-10-02T10:00:00Z"),
      endAtUtc: new Date("2026-10-02T11:00:00Z"),
    };
    bookingFindFirst.mockResolvedValue(row(finished));
    const reviewable = await getClientBooking(USER, "bk-1");
    expect(reviewable?.canReview).toBe(true);
    expect(reviewable?.reviewDeadlineUtc).toBe("2026-10-05T12:00:00.000Z");

    bookingFindFirst.mockResolvedValue(row({ ...finished, review: { id: "rv-1" } }));
    expect((await getClientBooking(USER, "bk-1"))?.reviewDeadlineUtc).toBeNull();

    bookingFindFirst.mockResolvedValue(
      row({ startAtUtc: new Date("2026-09-20T10:00:00Z"), endAtUtc: new Date("2026-09-20T11:00:00Z") }),
    );
    expect((await getClientBooking(USER, "bk-1"))?.reviewDeadlineUtc).toBeNull();

    bookingFindFirst.mockResolvedValue(row({ status: "CANCELLED", cancelledBy: "CLIENT" }));
    expect((await getClientBooking(USER, "bk-1"))?.reviewDeadlineUtc).toBeNull();
  });
});
