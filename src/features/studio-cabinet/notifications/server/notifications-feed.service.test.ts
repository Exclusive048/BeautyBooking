import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-STUDIO-C (ops) — лента уведомлений студии в приложении: заявки на
 * смену графика идут первыми, затем уведомления канала студии; смещение — по
 * этому общему списку, вкладки — по типам веба, ссылки — экраны приложения.
 */

const loadPendingScheduleRequestItems = vi.hoisted(() => vi.fn());
const resolveStudioNotificationScope = vi.hoisted(() => vi.fn());
const groupBy = vi.hoisted(() => vi.fn());
const count = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications/center", () => ({
  loadPendingScheduleRequestItems,
  mergeBookingPayload: (payload: unknown, booking: { status: string } | null) =>
    booking ? { ...(payload as object), bookingStatus: booking.status } : payload,
}));
vi.mock("@/lib/notifications/studio-feed", () => ({ resolveStudioNotificationScope }));
vi.mock("@/lib/prisma", () => ({ prisma: { notification: { groupBy, count, findMany } } }));

import { loadStudioNotificationFeed } from "./notifications-feed.service";

const SCOPE = { where: { userId: "user-1", scope: "studio" }, adminStudioIds: ["studio-1"] };

function pseudo(id: string, createdAt: string) {
  return {
    id: `schedule-request:${id}`,
    title: "Мастер просит изменить график",
    body: "Марина · График на 2026-10-10",
    type: "SCHEDULE_REQUEST",
    channel: "STUDIO",
    isRead: false,
    readAt: null,
    createdAt,
    payloadJson: null,
    openHref: "/cabinet/studio/schedule-requests",
  };
}

function row(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    type: "BOOKING_CREATED",
    title: "У вас новая запись",
    body: "Клиент Елена записался",
    isRead: false,
    readAt: null,
    createdAt: new Date("2026-10-03T10:00:00Z"),
    payloadJson: { clientName: "Елена" },
    bookingId: "b1",
    booking: {
      id: "b1",
      status: "PENDING",
      studioId: "studio-1",
      startAtUtc: new Date("2026-10-05T05:00:00Z"),
      proposedStartAt: null,
      actionRequiredBy: "MASTER",
      provider: { timezone: "Asia/Yekaterinburg" },
    },
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveStudioNotificationScope.mockResolvedValue(SCOPE);
  loadPendingScheduleRequestItems.mockResolvedValue([
    pseudo("r2", "2026-10-04T08:00:00.000Z"),
    pseudo("r1", "2026-10-03T08:00:00.000Z"),
  ]);
  groupBy.mockResolvedValue([
    { type: "BOOKING_CREATED", _count: { _all: 5 } },
    { type: "BOOKING_CANCELLED", _count: { _all: 2 } },
    { type: "STUDIO_MEMBER_LEFT", _count: { _all: 1 } },
  ]);
  // 1-й count — непрочитанные канала, 2-й — вкладка.
  count.mockResolvedValueOnce(3).mockResolvedValueOnce(8);
  findMany.mockResolvedValue([row("n1")]);
});

describe("loadStudioNotificationFeed", () => {
  it("первая страница: сначала заявки, затем уведомления до лимита", async () => {
    const page = await loadStudioNotificationFeed({
      userId: "user-1",
      studioId: "studio-1",
      chip: "all",
      offset: 0,
      limit: 3,
    });

    expect(page.items.map((item) => item.id)).toEqual(["schedule-request:r2", "schedule-request:r1", "n1"]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 1 }));
    expect(page).toMatchObject({ unreadCount: 5, needsDecisionCount: 2, total: 10 });
    expect(page.chipCounts).toMatchObject({ all: 10, unread: 5, bookings: 5, cancellations: 2, team: 3 });
    expect(page.items[0]).toMatchObject({
      type: "SCHEDULE_REQUEST",
      chip: "team",
      needsDecision: true,
      link: "/studio/schedule-requests",
      bookingId: null,
      payload: null,
    });
    expect(page.items[2]).toMatchObject({
      chip: "bookings",
      needsDecision: false,
      bookingId: "b1",
      link: "/studio/bookings/b1",
      payload: { clientName: "Елена", bookingStatus: "PENDING" },
      createdAt: "2026-10-03T10:00:00.000Z",
    });
  });

  it("следующая страница пропускает заявки и сдвигает смещение в базе", async () => {
    findMany.mockResolvedValue([row("n2"), row("n3")]);
    const page = await loadStudioNotificationFeed({
      userId: "user-1",
      studioId: "studio-1",
      chip: "all",
      offset: 3,
      limit: 3,
    });

    expect(page.items.map((item) => item.id)).toEqual(["n2", "n3"]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 1, take: 3 }));
  });

  it("вкладка «Записи»: без заявок, только типы вкладки", async () => {
    const page = await loadStudioNotificationFeed({
      userId: "user-1",
      studioId: "studio-1",
      chip: "bookings",
      offset: 0,
      limit: 20,
    });

    expect(page.items.map((item) => item.id)).toEqual(["n1"]);
    expect(page.total).toBe(8);
    const where = findMany.mock.calls[0]![0].where as { AND: Array<Record<string, unknown>> };
    expect(where.AND[0]).toBe(SCOPE.where);
    const types = (where.AND[1] as { type: { in: string[] } }).type.in;
    expect(types).toContain("BOOKING_CREATED");
    expect(types).not.toContain("BOOKING_CANCELLED");
  });

  it("вкладка «Непрочитанные»: заявки и непрочитанные уведомления", async () => {
    await loadStudioNotificationFeed({ userId: "user-1", studioId: "studio-1", chip: "unread", offset: 0, limit: 20 });
    const where = findMany.mock.calls[0]![0].where as { AND: Array<Record<string, unknown>> };
    expect(where.AND[1]).toEqual({ isRead: false });
  });

  it("запись другой студии — без перехода", async () => {
    findMany.mockResolvedValue([
      row("n9", { booking: { ...row("x").booking, studioId: "studio-2" } }),
    ]);
    const page = await loadStudioNotificationFeed({
      userId: "user-1",
      studioId: "studio-1",
      chip: "bookings",
      offset: 0,
      limit: 20,
    });
    expect(page.items[0]!.link).toBeNull();
  });
});
