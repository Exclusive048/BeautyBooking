import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-STUDIO-C (ops) — карточка записи студии: только запись студии
 * (личная запись мастера и чужая — `null`), телефон и ключ CRM клиента,
 * визиты клиента в студию по аккаунту или по телефону, право ответить на отзыв
 * — то же, что у `POST /api/reviews/{id}/reply`.
 */

const bookingFindFirst = vi.hoisted(() => vi.fn());
const bookingFindMany = vi.hoisted(() => vi.fn());
const providerFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: { findFirst: bookingFindFirst, findMany: bookingFindMany },
    provider: { findUnique: providerFindUnique },
  },
}));

import { getStudioBookingDetail } from "./booking-detail.service";

const NOW = new Date("2026-10-04T05:00:00Z");

function detailRow(patch: Record<string, unknown> = {}) {
  return {
    id: "b1",
    status: "CONFIRMED",
    source: "MANUAL",
    startAtUtc: new Date("2026-10-05T05:00:00Z"),
    endAtUtc: new Date("2026-10-05T06:30:00Z"),
    createdAt: new Date("2026-10-01T10:00:00Z"),
    proposedStartAt: null,
    proposedEndAt: null,
    requestedBy: null,
    actionRequiredBy: null,
    changeComment: null,
    bookingPackageId: null,
    providerId: "studio-prov",
    masterProviderId: "m1",
    serviceId: "svc1",
    clientUserId: null,
    clientName: "Елена",
    clientPhone: "8 999 123-45-67",
    clientPhoneSnapshot: null,
    clientUser: null,
    comment: "  ",
    notes: "Позвонила сама",
    silentMode: true,
    bookingAnswers: [{ questionText: "Аллергия?", answer: "Нет" }, { questionText: "Пусто", answer: " " }],
    clientChangeRequestsCount: 0,
    masterChangeRequestsCount: 1,
    cancelledBy: null,
    cancelReason: null,
    cancelledAtUtc: null,
    service: { name: "Маникюр", title: null, price: 200000, durationMin: 60 },
    serviceItems: [{ titleSnapshot: "Маникюр", priceSnapshot: 250000, durationSnapshotMin: 90 }],
    review: null,
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bookingFindFirst.mockResolvedValue(detailRow());
  bookingFindMany.mockResolvedValue([
    { startAtUtc: new Date("2026-09-01T05:00:00Z"), service: { price: 0 }, serviceItems: [{ priceSnapshot: 3_000_000 }] },
    { startAtUtc: new Date("2026-09-20T05:00:00Z"), service: { price: 0 }, serviceItems: [{ priceSnapshot: 2_500_000 }] },
    { startAtUtc: new Date("2026-10-05T05:00:00Z"), service: { price: 0 }, serviceItems: [{ priceSnapshot: 250_000 }] },
  ]);
  providerFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === "m1"
      ? { name: "Марина", avatarUrl: null, tagline: "Ногти", type: "MASTER", studioId: "studio-prov" }
      : { name: "Ольга", avatarUrl: null, tagline: null, type: "MASTER", studioId: "other-studio" },
  );
});

describe("getStudioBookingDetail", () => {
  it("ищет только среди записей студии", async () => {
    bookingFindFirst.mockResolvedValue(null);
    const detail = await getStudioBookingDetail({
      studioId: "studio-1",
      studioProviderId: "studio-prov",
      bookingId: "b-personal",
      now: NOW,
    });
    expect(detail).toBeNull();
    expect(bookingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ id: "b-personal" }, { studioId: "studio-1" }] } }),
    );
  });

  it("гость: телефон нормализован, визиты — по телефону среди записей без аккаунта", async () => {
    const detail = await getStudioBookingDetail({
      studioId: "studio-1",
      studioProviderId: "studio-prov",
      bookingId: "b1",
      now: NOW,
    });

    expect(detail).toMatchObject({
      id: "b1",
      runtimeStatus: "CONFIRMED",
      durationMin: 90,
      priceKopeks: 250000,
      master: { id: "m1", name: "Марина", specialization: "Ногти" },
      client: {
        name: "Елена",
        phone: "+79991234567",
        userId: null,
        key: "phone:+79991234567",
        avatarUrl: null,
        isNewClient: false,
        isVip: true,
        pastVisitsCount: 2,
      },
      services: [{ title: "Маникюр", price: 250000, durationMin: 90 }],
      comment: null,
      notes: "Позвонила сама",
      silentMode: true,
      answers: [{ question: "Аллергия?", answer: "Нет" }],
      masterChangeRequestsCount: 1,
      review: null,
      actions: { move: true, cancel: true, confirm: false },
    });
    const where = bookingFindMany.mock.calls[0]![0].where as { AND: Array<Record<string, unknown>> };
    expect(where.AND[0]).toEqual({ studioId: "studio-1" });
    expect(where.AND[1]).toMatchObject({ clientUserId: null });
    expect(JSON.stringify(where.AND[1])).toContain("+79991234567");
  });

  it("клиент с аккаунтом — визиты по аккаунту, ключ user:", async () => {
    bookingFindFirst.mockResolvedValue(
      detailRow({ clientUserId: "client-1", clientUser: { externalPhotoUrl: "https://img/a.jpg" } }),
    );
    bookingFindMany.mockResolvedValue([]);

    const detail = await getStudioBookingDetail({
      studioId: "studio-1",
      studioProviderId: "studio-prov",
      bookingId: "b1",
      now: NOW,
    });

    expect(detail?.client).toMatchObject({
      userId: "client-1",
      key: "user:client-1",
      avatarUrl: "https://img/a.jpg",
      isNewClient: true,
      isVip: false,
      pastVisitsCount: 0,
    });
    expect(bookingFindMany.mock.calls[0]![0].where.AND[1]).toEqual({ clientUserId: "client-1" });
  });

  it("отзыв о студии — ответить можно; о мастере другой студии — нет; удалённый — не показываем", async () => {
    const review = {
      id: "rev-1",
      rating: 5,
      text: "Отлично",
      replyText: null,
      repliedAt: null,
      createdAt: new Date("2026-10-02T10:00:00Z"),
      deletedAt: null,
      targetType: "studio",
      targetId: "studio-prov",
    };
    bookingFindFirst.mockResolvedValue(detailRow({ review }));
    const onStudio = await getStudioBookingDetail({ studioId: "studio-1", studioProviderId: "studio-prov", bookingId: "b1", now: NOW });
    expect(onStudio?.review).toMatchObject({ rating: 5, canReply: true });
    expect(onStudio?.review?.id).not.toBe("rev-1");

    bookingFindFirst.mockResolvedValue(detailRow({ review: { ...review, targetType: "provider", targetId: "m-left" } }));
    const onLeftMaster = await getStudioBookingDetail({ studioId: "studio-1", studioProviderId: "studio-prov", bookingId: "b1", now: NOW });
    expect(onLeftMaster?.review?.canReply).toBe(false);

    bookingFindFirst.mockResolvedValue(detailRow({ review: { ...review, targetType: "provider", targetId: "m1" } }));
    const onOwnMaster = await getStudioBookingDetail({ studioId: "studio-1", studioProviderId: "studio-prov", bookingId: "b1", now: NOW });
    expect(onOwnMaster?.review?.canReply).toBe(true);

    bookingFindFirst.mockResolvedValue(detailRow({ review: { ...review, deletedAt: new Date() } }));
    const deleted = await getStudioBookingDetail({ studioId: "studio-1", studioProviderId: "studio-prov", bookingId: "b1", now: NOW });
    expect(deleted?.review).toBeNull();
  });
});
