import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH — бейдж «Уведомления» в меню кабинета студии считается по
 * каналу студии (`getStudioNotificationCounts`), как лента
 * `/cabinet/studio/notifications` и бейдж приложения, а не по личным
 * уведомлениям.
 */

const prisma = vi.hoisted(() => ({
  studio: { findUnique: vi.fn() },
  scheduleChangeRequest: { count: vi.fn() },
  review: { count: vi.fn() },
}));
const getStudioNotificationCounts = vi.hoisted(() => vi.fn());
const getUnreadBadgeCount = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/notifications/studio-feed", () => ({ getStudioNotificationCounts }));
vi.mock("@/lib/notifications/badge", () => ({ getUnreadBadgeCount }));

import { getStudioSidebarCounts } from "./sidebar-counts.service";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.studio.findUnique.mockResolvedValue({ id: "studio-1", providerId: "sp-1" });
  prisma.scheduleChangeRequest.count.mockResolvedValue(2);
  prisma.review.count.mockResolvedValue(3);
  getStudioNotificationCounts.mockResolvedValue({ unreadCount: 5, needsDecisionCount: 2 });
  getUnreadBadgeCount.mockResolvedValue({ count: 40 });
});

describe("getStudioSidebarCounts", () => {
  it("уведомления — канал студии, не личные", async () => {
    const counts = await getStudioSidebarCounts({ studioId: "studio-1", userId: "user-1" });
    expect(counts).toEqual({ scheduleRequestsPending: 2, reviewsUnanswered: 3, notificationsUnread: 5 });
    expect(getStudioNotificationCounts).toHaveBeenCalledWith("user-1");
    expect(getUnreadBadgeCount).not.toHaveBeenCalled();
  });

  it("заявки — только ожидающие этой студии", async () => {
    await getStudioSidebarCounts({ studioId: "studio-1", userId: "user-1" });
    expect(prisma.scheduleChangeRequest.count).toHaveBeenCalledWith({
      where: { studioId: "studio-1", status: "PENDING" },
    });
  });
});
