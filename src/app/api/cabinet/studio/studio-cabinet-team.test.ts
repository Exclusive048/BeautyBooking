import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";

/**
 * MOBILE-STUDIO-C (team) — JSON-роуты команды студии для приложения:
 * `GET /api/cabinet/studio/masters`, `GET …/masters/{id}`,
 * `POST …/masters/{id}/invite/resend`, `GET …/schedule-requests`,
 * `GET …/settings`. Доступ — владелец / администратор студии из сессии
 * (`requireStudioCabinetAdmin`): 401 без входа, 403 мастеру студии; ответы
 * личные (`no-store`), причина 500 не раскрывается.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const resolveCurrentStudioAccess = vi.hoisted(() => vi.fn());
const providerFindUnique = vi.hoisted(() => vi.fn());
const loadStudioMastersList = vi.hoisted(() => vi.fn());
const getStudioTeamCapacity = vi.hoisted(() => vi.fn());
const loadStudioMasterDetail = vi.hoisted(() => vi.fn());
const getStudioMasterServicesMatrix = vi.hoisted(() => vi.fn());
const findPendingStudioMasterInvite = vi.hoisted(() => vi.fn());
const loadInviteWithRelations = vi.hoisted(() => vi.fn());
const notifyStudioInviteReceived = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn());
const refundRateLimit = vi.hoisted(() => vi.fn());
const listScheduleRequestsForStudio = vi.hoisted(() => vi.fn());
const loadStudioSettingsData = vi.hoisted(() => vi.fn());
const getStudioProviderById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/studio/current", () => ({ resolveCurrentStudioAccess }));
vi.mock("@/lib/prisma", () => ({ prisma: { provider: { findUnique: providerFindUnique } } }));
vi.mock("@/features/studio-cabinet/masters/server/masters-list.service", () => ({ loadStudioMastersList }));
vi.mock("@/lib/studio/team-limits", () => ({
  getStudioTeamCapacity,
  isStudioTeamAtCap: (activeCount: number, cap: number | null) => cap !== null && activeCount >= cap,
}));
vi.mock("@/features/studio-cabinet/masters/server/master-detail.service", () => ({ loadStudioMasterDetail }));
vi.mock("@/lib/studio/masters.service", () => ({ getStudioMasterServicesMatrix, findPendingStudioMasterInvite }));
vi.mock("@/lib/notifications/studio-notifications", () => ({ loadInviteWithRelations, notifyStudioInviteReceived }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, refundRateLimit }));
vi.mock("@/lib/rate-limit/keys", () => ({
  routeRateLimitKey: (_req: Request, axis: string, identity: string) => `rl:${axis}:${identity}`,
}));
vi.mock("@/features/studio-cabinet/schedule-requests/server/list.service", () => ({
  listScheduleRequestsForStudio,
}));
vi.mock("@/features/studio-cabinet/settings/server/settings-data.service", () => ({ loadStudioSettingsData }));
vi.mock("@/lib/studios/studio", () => ({ getStudioProviderById }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn(), getRequestId: () => "req" }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));

import { GET as getMasters } from "./masters/route";
import { GET as getMaster } from "./masters/[id]/route";
import { POST as resendInvite } from "./masters/[id]/invite/resend/route";
import { GET as getScheduleRequests } from "./schedule-requests/route";
import { GET as getSettings } from "./settings/route";

type Body = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; details?: Record<string, unknown> };
};

const url = (path: string) => `http://localhost/api/cabinet/studio${path}`;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const read = async (res: Response) => (await res.json()) as Body;

const LIST_ITEM = {
  id: "m-1",
  providerId: "m-1",
  urlHandle: "anna",
  userId: "u-2",
  displayName: "Анна",
  avatarUrl: "/api/media/file/a1",
  servicesSummary: "Маникюр, педикюр",
  status: "ACTIVE",
  isCurrentUser: false,
  metrics: { revenue30dKopeks: 1_500_000, bookings30d: 12, occupancy30dPercent: 8, rating: 4.9, reviewsCount: 7 },
};

const DETAIL = {
  ...LIST_ITEM,
  phone: "+79990000001",
  email: "anna@example.com",
  joinedAt: "2026-09-01T07:00:00.000Z",
  publicProfileUrl: "https://example.com/u/anna",
  clientsCount: 9,
  averageCheckKopeks: 125_000,
  weekSchedule: [
    { date: "2026-10-05", weekday: 1, dateLabel: "5 окт.", booked: 2, total: 8, isDayOff: false, isToday: true },
  ],
  viewToken: "secret-token",
  profile: { name: "Анна", tagline: "Мастер маникюра", description: "" },
  blockingStudioBookings: 3,
};

const MATRIX = [
  {
    serviceId: "svc-1",
    title: "Маникюр",
    isActive: true,
    basePriceKopeks: 200_000,
    baseDurationMin: 60,
    isEnabled: true,
    priceOverrideKopeks: null,
    durationOverrideMin: null,
    commissionPct: null,
    effectivePriceKopeks: 200_000,
    effectiveDurationMin: 60,
  },
];

function asMaster() {
  resolveCurrentStudioAccess.mockResolvedValue({
    studioId: "studio-1",
    providerId: "provider-s1",
    roles: [StudioRole.MASTER],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1", phone: "+79990000000", roles: ["STUDIO"] });
  resolveCurrentStudioAccess.mockResolvedValue({
    studioId: "studio-1",
    providerId: "provider-s1",
    roles: [StudioRole.OWNER],
  });
  providerFindUnique.mockImplementation(async (args: { select: Record<string, boolean> }) =>
    args.select.publicUsername ? { publicUsername: "lak" } : { timezone: "Asia/Yekaterinburg" },
  );
  loadStudioMastersList.mockResolvedValue({
    items: [LIST_ITEM],
    counts: { total: 3, active: 1, invited: 1, disabled: 1 },
  });
  getStudioTeamCapacity.mockResolvedValue({ max: 2, activeCount: 1 });
  loadStudioMasterDetail.mockResolvedValue(DETAIL);
  getStudioMasterServicesMatrix.mockResolvedValue(MATRIX);
  findPendingStudioMasterInvite.mockResolvedValue({ inviteId: "inv-1", channel: "EMAIL" });
  loadInviteWithRelations.mockResolvedValue({ id: "inv-1" });
  notifyStudioInviteReceived.mockResolvedValue(undefined);
  checkRateLimit.mockResolvedValue({ limited: false });
  refundRateLimit.mockResolvedValue(undefined);
  listScheduleRequestsForStudio.mockResolvedValue({ pending: [], resolved: [] });
  loadStudioSettingsData.mockResolvedValue({
    scope: { isOwner: true, isAdmin: false, roles: [StudioRole.OWNER], canDanger: true },
    general: { address: { cityName: "Екатеринбург", mapUrl: "https://yandex.ru/maps/?text=x" } },
    team: { owner: null, admins: [] },
    notifications: { pushEnabled: true },
    policy: {},
  });
  getStudioProviderById.mockResolvedValue({ id: "provider-s1", name: "Лак", timezone: "Asia/Yekaterinburg" });
});

describe("GET /api/cabinet/studio/masters", () => {
  it("returns masters without web-only fields, tab counts and the team cap", async () => {
    const res = await getMasters(new Request(url("/masters?filter=active&q=%20анна%20")));
    const body = await read(res);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.data).toEqual({
      filter: "active",
      q: "анна",
      items: [
        {
          id: "m-1",
          userId: "u-2",
          displayName: "Анна",
          avatarUrl: "/api/media/file/a1",
          servicesSummary: "Маникюр, педикюр",
          status: "ACTIVE",
          isCurrentUser: false,
          metrics: LIST_ITEM.metrics,
        },
      ],
      counts: { total: 3, active: 1, invited: 1, disabled: 1 },
      teamLimit: { max: 2, activeCount: 1, canInvite: true },
    });
    expect(loadStudioMastersList).toHaveBeenCalledWith({
      studioId: "studio-1",
      currentUserId: "user-1",
      filter: "active",
      search: "анна",
    });
    expect(getStudioTeamCapacity).toHaveBeenCalledWith("studio-1");
  });

  it("defaults to all masters and reports a full team", async () => {
    getStudioTeamCapacity.mockResolvedValue({ max: 2, activeCount: 2 });

    const body = await read(await getMasters(new Request(url("/masters"))));

    expect(body.data).toMatchObject({ filter: "all", q: "", teamLimit: { canInvite: false } });
  });

  it("lets anyone invite when the plan has no cap", async () => {
    getStudioTeamCapacity.mockResolvedValue({ max: null, activeCount: 40 });

    const body = await read(await getMasters(new Request(url("/masters"))));

    expect(body.data).toMatchObject({ teamLimit: { max: null, activeCount: 40, canInvite: true } });
  });

  it("answers 400 to an unknown filter", async () => {
    const res = await getMasters(new Request(url("/masters?filter=paused")));
    const body = await read(res);

    expect(res.status).toBe(400);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    expect(loadStudioMastersList).not.toHaveBeenCalled();
  });

  it("answers 401 without a session", async () => {
    getSessionUser.mockResolvedValue(null);

    const res = await getMasters(new Request(url("/masters")));

    expect(res.status).toBe(401);
    expect(resolveCurrentStudioAccess).not.toHaveBeenCalled();
  });

  it("refuses a studio master", async () => {
    asMaster();

    const res = await getMasters(new Request(url("/masters")));
    const body = await read(res);

    expect(res.status).toBe(403);
    expect(body.error).toMatchObject({ code: "FORBIDDEN", message: "Этот раздел доступен владельцу студии." });
    expect(loadStudioMastersList).not.toHaveBeenCalled();
  });

  it("hides the cause of a server failure", async () => {
    loadStudioMastersList.mockRejectedValue(new Error("db down"));

    const res = await getMasters(new Request(url("/masters")));
    const body = await read(res);

    expect(res.status).toBe(500);
    expect(body.error?.message).toBe("Не удалось загрузить мастеров. Попробуйте ещё раз.");
  });
});

describe("GET /api/cabinet/studio/masters/{id}", () => {
  it("returns the card with actions, both studio ids and the services matrix", async () => {
    const res = await getMaster(new Request(url("/masters/m-1")), params("m-1"));
    const body = await read(res);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.data).toMatchObject({
      timezone: "Asia/Yekaterinburg",
      studio: { id: "studio-1", providerId: "provider-s1" },
      master: {
        id: "m-1",
        phone: "+79990000001",
        email: "anna@example.com",
        joinedAt: "2026-09-01T07:00:00.000Z",
        clientsCount: 9,
        averageCheckKopeks: 125_000,
        weekSchedule: DETAIL.weekSchedule,
        profile: DETAIL.profile,
        blockingStudioBookings: 3,
        actions: {
          pause: true,
          activate: false,
          remove: true,
          revokeInvite: false,
          resendInvite: false,
          editSchedule: true,
        },
      },
      services: MATRIX,
    });
    const master = body.data?.master as Record<string, unknown>;
    expect(master).not.toHaveProperty("viewToken");
    expect(master).not.toHaveProperty("publicProfileUrl");
    expect(master).not.toHaveProperty("urlHandle");
    expect(loadStudioMasterDetail).toHaveBeenCalledWith({
      studioId: "studio-1",
      masterId: "m-1",
      currentUserId: "user-1",
    });
    expect(getStudioMasterServicesMatrix).toHaveBeenCalledWith({ studioId: "studio-1", masterId: "m-1" });
  });

  it("answers 404 for a master outside the studio", async () => {
    loadStudioMasterDetail.mockResolvedValue(null);

    const res = await getMaster(new Request(url("/masters/m-x")), params("m-x"));
    const body = await read(res);

    expect(res.status).toBe(404);
    expect(body.error).toMatchObject({ code: "MASTER_NOT_FOUND", message: "Мастер не найден." });
    expect(getStudioMasterServicesMatrix).not.toHaveBeenCalled();
  });

  it("answers 404 to an impossible id without a lookup", async () => {
    const id = "x".repeat(65);

    const res = await getMaster(new Request(url(`/masters/${id}`)), params(id));

    expect(res.status).toBe(404);
    expect(loadStudioMasterDetail).not.toHaveBeenCalled();
  });

  it("answers 401 without a session", async () => {
    getSessionUser.mockResolvedValue(null);

    expect((await getMaster(new Request(url("/masters/m-1")), params("m-1"))).status).toBe(401);
  });

  it("refuses a studio master", async () => {
    asMaster();

    const res = await getMaster(new Request(url("/masters/m-1")), params("m-1"));

    expect(res.status).toBe(403);
    expect(loadStudioMasterDetail).not.toHaveBeenCalled();
  });

  it("hides the cause of a server failure", async () => {
    getStudioMasterServicesMatrix.mockRejectedValue(new Error("db down"));

    const res = await getMaster(new Request(url("/masters/m-1")), params("m-1"));
    const body = await read(res);

    expect(res.status).toBe(500);
    expect(body.error?.message).toBe("Не удалось загрузить мастера. Попробуйте ещё раз.");
  });
});

describe("POST /api/cabinet/studio/masters/{id}/invite/resend", () => {
  const post = (id = "m-1") =>
    resendInvite(new Request(url(`/masters/${id}/invite/resend`), { method: "POST" }), params(id));

  it("sends the pending invite again", async () => {
    const res = await post();
    const body = await read(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ inviteId: "inv-1", channel: "EMAIL" });
    expect(findPendingStudioMasterInvite).toHaveBeenCalledWith({ studioId: "studio-1", masterId: "m-1" });
    expect(checkRateLimit).toHaveBeenCalledWith("rl:master:m-1", { windowSeconds: 3600, maxRequests: 3 });
    expect(loadInviteWithRelations).toHaveBeenCalledWith("inv-1");
    expect(notifyStudioInviteReceived).toHaveBeenCalledWith({ id: "inv-1" });
  });

  it("answers 409 when there is no pending invite, without using an attempt", async () => {
    findPendingStudioMasterInvite.mockRejectedValue(
      new AppError("У мастера нет активного приглашения.", 409, "MASTER_NOT_INVITED"),
    );

    const res = await post();
    const body = await read(res);

    expect(res.status).toBe(409);
    expect(body.error).toMatchObject({ code: "MASTER_NOT_INVITED", message: "У мастера нет активного приглашения." });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(notifyStudioInviteReceived).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown master", async () => {
    findPendingStudioMasterInvite.mockRejectedValue(new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND"));

    const res = await post("m-x");

    expect(res.status).toBe(404);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("answers 404 to an impossible id without a lookup", async () => {
    const res = await post("x".repeat(65));

    expect(res.status).toBe(404);
    expect(findPendingStudioMasterInvite).not.toHaveBeenCalled();
  });

  it("answers 429 with Retry-After after three resends in an hour", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 1800 });

    const res = await post();
    const body = await read(res);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1800");
    expect(body.error).toMatchObject({
      code: "RATE_LIMITED",
      message: "Приглашение уже отправили несколько раз. Попробуйте через час.",
    });
    expect(notifyStudioInviteReceived).not.toHaveBeenCalled();
  });

  it("answers 503 when the limiter is unavailable", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 60, reason: "unavailable" });

    const res = await post();
    const body = await read(res);

    expect(res.status).toBe(503);
    expect(body.error?.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(notifyStudioInviteReceived).not.toHaveBeenCalled();
  });

  it("returns the attempt and hides the cause when sending fails", async () => {
    notifyStudioInviteReceived.mockRejectedValue(new Error("smtp down"));

    const res = await post();
    const body = await read(res);

    expect(res.status).toBe(500);
    expect(body.error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Не удалось отправить приглашение ещё раз. Попробуйте ещё раз.",
    });
    expect(refundRateLimit).toHaveBeenCalledWith("rl:master:m-1");
  });

  it("answers 401 without a session", async () => {
    getSessionUser.mockResolvedValue(null);

    expect((await post()).status).toBe(401);
    expect(findPendingStudioMasterInvite).not.toHaveBeenCalled();
  });

  it("refuses a studio master", async () => {
    asMaster();

    const res = await post();

    expect(res.status).toBe(403);
    expect(findPendingStudioMasterInvite).not.toHaveBeenCalled();
  });
});

describe("GET /api/cabinet/studio/schedule-requests", () => {
  const PENDING = {
    id: "req-1",
    status: "PENDING",
    comment: null,
    createdAt: "2026-10-03T08:00:00.000Z",
    updatedAt: "2026-10-03T08:00:00.000Z",
    provider: { id: "m-1", name: "Анна", avatarUrl: null },
    payload: { format: "CHANGES_V1", week: null, pattern: null, days: [{ date: "2026-10-07", action: { kind: "off" } }] },
    review: null,
  };

  it("returns pending and decided requests with ready previews", async () => {
    listScheduleRequestsForStudio.mockResolvedValue({
      pending: [PENDING],
      resolved: [{ ...PENDING, id: "req-0", status: "APPROVED", payload: { overrides: [{}] } }],
    });

    const res = await getScheduleRequests(new Request(url("/schedule-requests")));
    const body = await read(res);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.data).toMatchObject({
      timezone: "Asia/Yekaterinburg",
      pending: [
        {
          id: "req-1",
          provider: { id: "m-1", name: "Анна", avatarUrl: null },
          canApprove: true,
          canReject: true,
          preview: { format: "CHANGES_V1", dayCount: 1 },
          reviewPreview: null,
        },
      ],
      resolved: [{ id: "req-0", status: "APPROVED", canApprove: false, canReject: false }],
    });
    const item = (body.data?.pending as Array<Record<string, unknown>>)[0];
    expect(item).not.toHaveProperty("payload");
    expect(item).not.toHaveProperty("review");
    expect(listScheduleRequestsForStudio).toHaveBeenCalledWith("studio-1");
  });

  it("answers 401 without a session", async () => {
    getSessionUser.mockResolvedValue(null);

    expect((await getScheduleRequests(new Request(url("/schedule-requests")))).status).toBe(401);
  });

  it("refuses a studio master", async () => {
    asMaster();

    const res = await getScheduleRequests(new Request(url("/schedule-requests")));

    expect(res.status).toBe(403);
    expect(listScheduleRequestsForStudio).not.toHaveBeenCalled();
  });

  it("hides the cause of a server failure", async () => {
    listScheduleRequestsForStudio.mockRejectedValue(new Error("db down"));

    const res = await getScheduleRequests(new Request(url("/schedule-requests")));
    const body = await read(res);

    expect(res.status).toBe(500);
    expect(body.error?.message).toBe("Не удалось загрузить заявки на расписание. Попробуйте ещё раз.");
  });
});

describe("GET /api/cabinet/studio/settings", () => {
  it("returns rights, both ids, address bits, the public username and the profile form", async () => {
    const res = await getSettings(new Request(url("/settings")));
    const body = await read(res);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.data).toEqual({
      timezone: "Asia/Yekaterinburg",
      scope: {
        isOwner: true,
        isAdmin: false,
        roles: ["OWNER"],
        canDanger: true,
        canEditPublicUsername: true,
      },
      studio: {
        id: "studio-1",
        providerId: "provider-s1",
        publicUsername: "lak",
        cityName: "Екатеринбург",
        mapUrl: "https://yandex.ru/maps/?text=x",
        profile: { id: "provider-s1", name: "Лак", timezone: "Asia/Yekaterinburg" },
      },
      team: { owner: null, admins: [] },
    });
    expect(loadStudioSettingsData).toHaveBeenCalledWith({ studioId: "studio-1", currentUserId: "user-1" });
    expect(getStudioProviderById).toHaveBeenCalledWith("provider-s1");
  });

  it("does not let an admin edit the public username", async () => {
    resolveCurrentStudioAccess.mockResolvedValue({
      studioId: "studio-1",
      providerId: "provider-s1",
      roles: [StudioRole.ADMIN],
    });
    loadStudioSettingsData.mockResolvedValue({
      scope: { isOwner: false, isAdmin: true, roles: [StudioRole.ADMIN], canDanger: false },
      general: { address: { cityName: null, mapUrl: null } },
      team: { owner: null, admins: [] },
    });

    const body = await read(await getSettings(new Request(url("/settings"))));

    expect(body.data).toMatchObject({
      scope: { isOwner: false, isAdmin: true, canDanger: false, canEditPublicUsername: false },
      studio: { cityName: null, mapUrl: null },
    });
  });

  it("answers 404 when the studio is gone", async () => {
    getStudioProviderById.mockResolvedValue(null);

    const res = await getSettings(new Request(url("/settings")));
    const body = await read(res);

    expect(res.status).toBe(404);
    expect(body.error?.code).toBe("STUDIO_NOT_FOUND");
  });

  it("answers 401 without a session", async () => {
    getSessionUser.mockResolvedValue(null);

    expect((await getSettings(new Request(url("/settings")))).status).toBe(401);
  });

  it("refuses a studio master", async () => {
    asMaster();

    const res = await getSettings(new Request(url("/settings")));

    expect(res.status).toBe(403);
    expect(loadStudioSettingsData).not.toHaveBeenCalled();
  });

  it("hides the cause of a server failure", async () => {
    loadStudioSettingsData.mockRejectedValue(new Error("db down"));

    const res = await getSettings(new Request(url("/settings")));
    const body = await read(res);

    expect(res.status).toBe(500);
    expect(body.error?.message).toBe("Не удалось загрузить настройки студии. Попробуйте ещё раз.");
  });
});
