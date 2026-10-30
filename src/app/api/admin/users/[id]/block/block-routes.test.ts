import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType } from "@prisma/client";

/**
 * USER-BLOCKING-01 — тонкие роуты блокировки и разблокировки: доступ только
 * администратору (`requireAdminAuth`), причина обязательна и ограничена по
 * длине, разблокировка принимает пустое тело, отказы сервиса уходят наружу
 * его курируемым текстом, неожиданный сбой — общей строкой 500.
 *
 * Правила «кого нельзя» и аудит в транзакции — `block.service.test.ts`.
 *
 * @probe 2026-10-30 — в роуте блокировки снят `requireAdminAuth` (ветка
 *        `!auth.ok`) — красный «не администратор — 403…» (сервис вызывался).
 *        У причины убран `.min(1)` — красный «пустая причина…». В роуте
 *        разблокировки пустое тело отдано в `parseBody` — красный «пустое
 *        тело…» (400). Возвращено — зелёные.
 */

const spies = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({ requireAdminAuth: spies.requireAdminAuth }));
vi.mock("@/features/admin-cabinet/users/server/block.service", () => ({
  BLOCK_REASON_MAX_LENGTH: 500,
  blockUser: spies.blockUser,
  unblockUser: spies.unblockUser,
}));
vi.mock("@/lib/audit/admin-audit-context", () => ({
  getAdminAuditContext: () => ({ ipAddress: "203.0.113.7", userAgent: "test" }),
}));
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req_1",
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

import { AppError } from "@/lib/api/errors";
import { fail } from "@/lib/api/response";
import { POST as blockRoute } from "@/app/api/admin/users/[id]/block/route";
import { POST as unblockRoute } from "@/app/api/admin/users/[id]/unblock/route";

const ADMIN = { id: "admin-1", roles: [AccountType.CLIENT, AccountType.ADMIN] };

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(path: string, body?: unknown): Request {
  return new Request(`https://app.test${path}`, {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function envelope(res: Response) {
  return (await res.json()) as { ok: boolean; data?: unknown; error?: { message: string; code: string } };
}

beforeEach(() => {
  vi.clearAllMocks();
  spies.requireAdminAuth.mockResolvedValue({ ok: true, user: ADMIN });
  spies.blockUser.mockResolvedValue({ userId: "u1", blockedAt: "2026-10-30T10:00:00.000Z", blockedReason: "Спам" });
  spies.unblockUser.mockResolvedValue({ userId: "u1", blockedAt: null, blockedReason: null });
});

describe("POST /api/admin/users/[id]/block", () => {
  it("не администратор — 403 без вызова сервиса", async () => {
    spies.requireAdminAuth.mockResolvedValue({
      ok: false,
      response: fail("Недостаточно прав для этого действия.", 403, "FORBIDDEN"),
    });
    const res = await blockRoute(post("/api/admin/users/u1/block", { reason: "Спам" }), ctx("u1"));
    expect(res.status).toBe(403);
    expect(spies.blockUser).not.toHaveBeenCalled();
  });

  it("причина обрезается и уходит в сервис вместе с администратором и контекстом аудита", async () => {
    const res = await blockRoute(post("/api/admin/users/u1/block", { reason: "  Спам  " }), ctx("u1"));
    expect(res.status).toBe(200);
    expect((await envelope(res)).data).toEqual({
      user: { userId: "u1", blockedAt: "2026-10-30T10:00:00.000Z", blockedReason: "Спам" },
    });
    expect(spies.blockUser).toHaveBeenCalledWith({
      actor: { id: "admin-1", roles: ADMIN.roles },
      targetUserId: "u1",
      reason: "Спам",
      context: { ipAddress: "203.0.113.7", userAgent: "test" },
    });
  });

  it("пустая причина и слишком длинная — 400 без вызова сервиса", async () => {
    for (const reason of ["   ", "я".repeat(501)]) {
      const res = await blockRoute(post("/api/admin/users/u1/block", { reason }), ctx("u1"));
      expect(res.status).toBe(400);
      expect((await envelope(res)).error?.code).toBe("VALIDATION_ERROR");
    }
    const missing = await blockRoute(post("/api/admin/users/u1/block", {}), ctx("u1"));
    expect(missing.status).toBe(400);
    expect(spies.blockUser).not.toHaveBeenCalled();
  });

  it("кривой id — 404 без вызова сервиса", async () => {
    const res = await blockRoute(post("/api/admin/users/x/block", { reason: "Спам" }), ctx("../etc"));
    expect(res.status).toBe(404);
    expect(spies.blockUser).not.toHaveBeenCalled();
  });

  it("отказ сервиса уходит его текстом и кодом; сбой — общей строкой 500", async () => {
    spies.blockUser.mockRejectedValueOnce(
      new AppError("Нельзя заблокировать последнего администратора платформы.", 409, "CONFLICT"),
    );
    const refused = await blockRoute(post("/api/admin/users/u1/block", { reason: "Спам" }), ctx("u1"));
    expect(refused.status).toBe(409);
    expect((await envelope(refused)).error).toEqual({
      message: "Нельзя заблокировать последнего администратора платформы.",
      code: "CONFLICT",
    });

    spies.blockUser.mockRejectedValueOnce(new Error("db down"));
    const crashed = await blockRoute(post("/api/admin/users/u1/block", { reason: "Спам" }), ctx("u1"));
    expect(crashed.status).toBe(500);
    expect((await envelope(crashed)).error).toEqual({
      message: "Не удалось заблокировать пользователя. Попробуйте ещё раз.",
      code: "INTERNAL_ERROR",
    });
  });
});

describe("POST /api/admin/users/[id]/unblock", () => {
  it("пустое тело — разблокировка без причины", async () => {
    const res = await unblockRoute(post("/api/admin/users/u1/unblock"), ctx("u1"));
    expect(res.status).toBe(200);
    expect(spies.unblockUser).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { id: "admin-1", roles: ADMIN.roles }, targetUserId: "u1", reason: null }),
    );
  });

  it("причина необязательна, но ограничена по длине", async () => {
    const withReason = await unblockRoute(post("/api/admin/users/u1/unblock", { reason: " Ошибка " }), ctx("u1"));
    expect(withReason.status).toBe(200);
    expect(spies.unblockUser).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "Ошибка" }));

    const tooLong = await unblockRoute(post("/api/admin/users/u1/unblock", { reason: "я".repeat(501) }), ctx("u1"));
    expect(tooLong.status).toBe(400);
  });

  it("не администратор — 403 без вызова сервиса", async () => {
    spies.requireAdminAuth.mockResolvedValue({
      ok: false,
      response: fail("Недостаточно прав для этого действия.", 403, "FORBIDDEN"),
    });
    const res = await unblockRoute(post("/api/admin/users/u1/unblock"), ctx("u1"));
    expect(res.status).toBe(403);
    expect(spies.unblockUser).not.toHaveBeenCalled();
  });
});
