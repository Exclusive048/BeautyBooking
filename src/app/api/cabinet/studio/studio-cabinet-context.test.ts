import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";

/**
 * MOBILE-STUDIO-C — `GET /api/cabinet/studio/context` и доступ к кабинету
 * студии (`resolveStudioCabinetAccess` / `requireStudioCabinetAdmin`):
 * оба id студии, роли, пояс салона, бейджи только владельцу / администратору,
 * 401 без сессии, 403 без членства, личный `no-store`.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const resolveCurrentStudioAccess = vi.hoisted(() => vi.fn());
const providerFindUnique = vi.hoisted(() => vi.fn());
const getStudioShellInfo = vi.hoisted(() => vi.fn());
const getStudioSidebarCounts = vi.hoisted(() => vi.fn());
const getStudioNotificationCounts = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/studio/current", () => ({ resolveCurrentStudioAccess }));
vi.mock("@/lib/prisma", () => ({ prisma: { provider: { findUnique: providerFindUnique } } }));
vi.mock("@/features/studio-cabinet/server/studio-info.service", () => ({ getStudioShellInfo }));
vi.mock("@/features/studio-cabinet/server/sidebar-counts.service", () => ({ getStudioSidebarCounts }));
vi.mock("@/lib/notifications/studio-feed", () => ({ getStudioNotificationCounts }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn(), getRequestId: () => "req" }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));

import { GET } from "./context/route";
import { requireStudioCabinetAdmin, resolveStudioCabinetAccess } from "@/lib/studio/cabinet-access";

type Body = { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };

const req = () => new Request("http://localhost/api/cabinet/studio/context");

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1", phone: "+79990000000", roles: ["STUDIO"] });
  resolveCurrentStudioAccess.mockResolvedValue({
    studioId: "studio-1",
    providerId: "provider-s1",
    roles: [StudioRole.OWNER],
  });
  providerFindUnique.mockResolvedValue({
    timezone: "Asia/Yekaterinburg",
    publicUsername: "lak",
    isPublished: true,
  });
  getStudioShellInfo.mockResolvedValue({
    id: "studio-1",
    providerId: "provider-s1",
    name: "Лак",
    avatarUrl: "/api/media/file/a1",
    mastersCount: 4,
    publicHref: "/u/lak",
  });
  getStudioSidebarCounts.mockResolvedValue({
    scheduleRequestsPending: 2,
    reviewsUnanswered: 3,
    notificationsUnread: 9,
  });
  getStudioNotificationCounts.mockResolvedValue({ unreadCount: 4, needsDecisionCount: 1 });
});

describe("GET /api/cabinet/studio/context", () => {
  it("returns both studio ids, roles, salon timezone and badges for the owner", async () => {
    const res = await GET(req());
    const body = (await res.json()) as Body;

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.data).toMatchObject({
      studio: {
        id: "studio-1",
        providerId: "provider-s1",
        name: "Лак",
        avatarUrl: "/api/media/file/a1",
        publicUsername: "lak",
        isPublished: true,
        timezone: "Asia/Yekaterinburg",
        mastersCount: 4,
      },
      roles: ["OWNER"],
      isOwner: true,
      canAdminister: true,
      // MOBILE-STUDIO-C (ops): уведомления — канал студии, а не личные (9 из сайдбара веба).
      counts: { scheduleRequestsPending: 2, reviewsUnanswered: 3, notificationsUnread: 4 },
    });
    expect(getStudioNotificationCounts).toHaveBeenCalledWith("user-1");
    expect(body.data?.todayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(getStudioSidebarCounts).toHaveBeenCalledWith({
      studioId: "studio-1",
      userId: "user-1",
      phone: "+79990000000",
    });
  });

  it("gives a studio master the context without badges", async () => {
    resolveCurrentStudioAccess.mockResolvedValue({
      studioId: "studio-1",
      providerId: "provider-s1",
      roles: [StudioRole.MASTER],
    });

    const body = (await (await GET(req())).json()) as Body;

    expect(body.data).toMatchObject({ isOwner: false, canAdminister: false, counts: null });
    expect(getStudioSidebarCounts).not.toHaveBeenCalled();
    expect(getStudioNotificationCounts).not.toHaveBeenCalled();
  });

  it("answers 401 without a session", async () => {
    getSessionUser.mockResolvedValue(null);

    const res = await GET(req());

    expect(res.status).toBe(401);
    expect(resolveCurrentStudioAccess).not.toHaveBeenCalled();
  });

  it("passes 403 through when the user has no studio", async () => {
    resolveCurrentStudioAccess.mockRejectedValue(
      new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN"),
    );

    const res = await GET(req());
    const body = (await res.json()) as Body;

    expect(res.status).toBe(403);
    expect(body.error?.code).toBe("FORBIDDEN");
  });

  it("hides the cause of a server failure", async () => {
    getStudioShellInfo.mockRejectedValue(new Error("db down"));

    const res = await GET(req());
    const body = (await res.json()) as Body;

    expect(res.status).toBe(500);
    expect(body.error?.message).toBe("Не удалось загрузить кабинет студии. Попробуйте ещё раз.");
  });
});

describe("studio cabinet access", () => {
  it("falls back to Moscow when the studio has no timezone", async () => {
    providerFindUnique.mockResolvedValue(null);

    const access = await resolveStudioCabinetAccess("user-1");

    expect(access).toMatchObject({ studioId: "studio-1", providerId: "provider-s1", timezone: "Europe/Moscow" });
  });

  it("treats an admin like the owner but not as the owner", async () => {
    resolveCurrentStudioAccess.mockResolvedValue({
      studioId: "studio-1",
      providerId: "provider-s1",
      roles: [StudioRole.ADMIN],
    });

    const access = await requireStudioCabinetAdmin("user-1");

    expect(access).toMatchObject({ isOwner: false, canAdminister: true });
  });

  it("refuses the admin-only sections to a studio master", async () => {
    resolveCurrentStudioAccess.mockResolvedValue({
      studioId: "studio-1",
      providerId: "provider-s1",
      roles: [StudioRole.MASTER],
    });

    await expect(requireStudioCabinetAdmin("user-1")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "Этот раздел доступен владельцу студии.",
    });
  });
});
