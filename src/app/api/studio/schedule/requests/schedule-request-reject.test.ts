import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH — `POST /api/studio/schedule/requests/{id}/reject`: комментарий
 * обязателен и не длиннее 500 символов (уходит мастеру в уведомлении). Отказ —
 * 400 `VALIDATION_ERROR` с русским текстом и `error.fieldErrors.comment`.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const resolveCurrentStudioAccess = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  scheduleChangeRequest: { findFirst: vi.fn(), update: vi.fn() },
}));
const loadScheduleRequestWithRelations = vi.hoisted(() => vi.fn());
const notifyScheduleRequestRejected = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/studio/current", () => ({ resolveCurrentStudioAccess }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/notifications/studio-notifications", () => ({
  loadScheduleRequestWithRelations,
  notifyScheduleRequestRejected,
}));

import { POST } from "@/app/api/studio/schedule/requests/[id]/reject/route";
import { SCHEDULE_REQUEST_REJECT_COMMENT_MAX } from "@/features/studio-cabinet/schedule-requests/lib/reject-comment";

type Body = {
  ok: boolean;
  data?: { id: string; status: string };
  error?: { code: string; message: string; fieldErrors?: Record<string, string> };
};

async function reject(body: unknown): Promise<{ status: number; body: Body }> {
  const response = await POST(
    new Request("https://example.test/api/studio/schedule/requests/req-1/reject", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "req-1" }) },
  );
  return { status: response.status, body: (await response.json()) as Body };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1" });
  resolveCurrentStudioAccess.mockResolvedValue({ studioId: "studio-1", roles: ["ADMIN"] });
  prisma.scheduleChangeRequest.findFirst.mockResolvedValue({ id: "req-1", status: "PENDING" });
  prisma.scheduleChangeRequest.update.mockResolvedValue({});
  loadScheduleRequestWithRelations.mockResolvedValue(null);
});

describe("POST /api/studio/schedule/requests/{id}/reject", () => {
  it("лимит — 500 символов", () => {
    expect(SCHEDULE_REQUEST_REJECT_COMMENT_MAX).toBe(500);
  });

  it("401 без сессии", async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await reject({ comment: "Нет" })).status).toBe(401);
  });

  it("403 не администратору", async () => {
    resolveCurrentStudioAccess.mockResolvedValue({ studioId: "studio-1", roles: ["MASTER"] });
    expect((await reject({ comment: "Нет" })).status).toBe(403);
  });

  it.each([[{}], [{ comment: "   " }], [{ comment: 5 }], [null]])("нет комментария (%j) — 400", async (payload) => {
    const { status, body } = await reject(payload);
    expect(status).toBe(400);
    expect(body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Комментарий обязателен.",
      fieldErrors: { comment: "Комментарий обязателен." },
    });
    expect(prisma.scheduleChangeRequest.update).not.toHaveBeenCalled();
  });

  it("длиннее 500 символов — 400 с текстом и fieldErrors.comment", async () => {
    const { status, body } = await reject({ comment: "я".repeat(501) });
    expect(status).toBe(400);
    expect(body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Комментарий — не длиннее 500 символов.",
      fieldErrors: { comment: "Комментарий — не длиннее 500 символов." },
    });
    expect(prisma.scheduleChangeRequest.update).not.toHaveBeenCalled();
  });

  it("ровно 500 символов (с пробелами по краям) — отклоняем, комментарий обрезан", async () => {
    const comment = "я".repeat(500);
    const { status, body } = await reject({ comment: `  ${comment}  ` });
    expect(status).toBe(200);
    expect(body.data).toEqual({ id: "req-1", status: "REJECTED" });
    expect(prisma.scheduleChangeRequest.update).toHaveBeenCalledWith({
      where: { id: "req-1" },
      data: { status: "REJECTED", comment },
    });
  });

  it("чужая или несуществующая заявка — 404", async () => {
    prisma.scheduleChangeRequest.findFirst.mockResolvedValue(null);
    expect((await reject({ comment: "Нет" })).status).toBe(404);
    expect(prisma.scheduleChangeRequest.findFirst).toHaveBeenCalledWith({
      where: { id: "req-1", studioId: "studio-1" },
      select: { id: true, status: true },
    });
  });

  it("уже обработана — 400", async () => {
    prisma.scheduleChangeRequest.findFirst.mockResolvedValue({ id: "req-1", status: "APPROVED" });
    const { status, body } = await reject({ comment: "Нет" });
    expect(status).toBe(400);
    expect(body.error?.message).toBe("Запрос уже обработан.");
  });
});
