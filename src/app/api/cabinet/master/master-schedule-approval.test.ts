import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH — `GET /api/cabinet/master/schedule?studioId=&masterId=`
 * (`approval.mode = STUDIO_ADMIN`): открытая заявка мастера видна
 * администратору (`pendingRequestId`, `requestStatus: "PENDING"`), только для
 * показа. Отклонённые заявки администратору не показываются.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const resolveScheduleActor = vi.hoisted(() => vi.fn());
const buildScheduleSnapshot = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  scheduleChangeRequest: { findFirst: vi.fn() },
}));

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/schedule/schedule-actor", () => ({ resolveScheduleActor }));
vi.mock("@/lib/schedule/editor", () => ({ buildScheduleSnapshot }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/schedule/slotsCache", () => ({ invalidateSlotsForMaster: vi.fn() }));
vi.mock("@/lib/notifications/studio-notifications", () => ({ notifyMasterScheduleUpdatedByStudio: vi.fn() }));
vi.mock("@/lib/schedule/change-requests", () => ({
  exceptionsToDayChanges: vi.fn(),
  submitStudioScheduleChange: vi.fn(),
}));
vi.mock("@/lib/master/profile.service", () => ({ updateMasterProfile: vi.fn() }));
vi.mock("@/lib/billing/get-current-plan", () => ({ getCurrentPlan: vi.fn() }));

import { GET } from "@/app/api/cabinet/master/schedule/route";

const SNAPSHOT = { weekSchedule: [], exceptions: [] };

async function load() {
  const response = await GET(
    new Request("https://example.test/api/cabinet/master/schedule?studioId=studio-1&masterId=master-1"),
  );
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "admin-1" });
  buildScheduleSnapshot.mockResolvedValue(SNAPSHOT);
  resolveScheduleActor.mockResolvedValue({ mode: "STUDIO_ADMIN", providerId: "master-1", studioProviderId: "sp-1" });
});

describe("GET /api/cabinet/master/schedule — approval в режиме администратора студии", () => {
  it("открытая заявка мастера — id и PENDING", async () => {
    prisma.scheduleChangeRequest.findFirst.mockResolvedValue({ id: "req-9" });
    const { status, body } = await load();
    expect(status).toBe(200);
    expect(body.data.approval).toEqual({
      mode: "STUDIO_ADMIN",
      requestStatus: "PENDING",
      pendingRequestId: "req-9",
      rejectedComment: null,
    });
    expect(prisma.scheduleChangeRequest.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.scheduleChangeRequest.findFirst).toHaveBeenCalledWith({
      where: { providerId: "master-1", status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
  });

  it("нет открытой заявки — null", async () => {
    prisma.scheduleChangeRequest.findFirst.mockResolvedValue(null);
    const { body } = await load();
    expect(body.data.approval).toMatchObject({ requestStatus: null, pendingRequestId: null, rejectedComment: null });
  });

  it("мастер-одиночка — заявки не ищем", async () => {
    resolveScheduleActor.mockResolvedValue({ mode: "SOLO_MASTER", providerId: "master-1", studioProviderId: null });
    const { body } = await load();
    expect(body.data.approval).toEqual({
      mode: "SOLO_MASTER",
      requestStatus: null,
      pendingRequestId: null,
      rejectedComment: null,
    });
    expect(prisma.scheduleChangeRequest.findFirst).not.toHaveBeenCalled();
  });

  it("мастер студии — как раньше: открытая заявка и комментарий отказа", async () => {
    resolveScheduleActor.mockResolvedValue({ mode: "STUDIO_MASTER", providerId: "master-1", studioProviderId: "sp-1" });
    prisma.scheduleChangeRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ comment: "Нужны вечерние окна." });
    const { body } = await load();
    expect(body.data.approval).toEqual({
      mode: "STUDIO_MASTER",
      requestStatus: "REJECTED",
      pendingRequestId: null,
      rejectedComment: "Нужны вечерние окна.",
    });
  });
});
