import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { AppError } from "@/lib/api/errors";

/**
 * MOBILE-POLISH (App Store 1.2) — роуты решений по жалобам в админке:
 * только администратор, «Принять меры» требует пометку, «Отклонить» — нет
 * (можно и без тела), отказы сервиса (409) проходят как есть.
 */

const requireAdminAuth = vi.hoisted(() => vi.fn());
const decideContentReport = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/features/admin-cabinet/reports/server/reports.service", () => ({ decideContentReport }));
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req_1",
  logError: vi.fn(),
  logInfo: vi.fn(),
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));

const { POST: resolve } = await import("@/app/api/admin/reports/[id]/resolve/route");
const { POST: dismiss } = await import("@/app/api/admin/reports/[id]/dismiss/route");

function req(body?: unknown) {
  return new Request("https://app.test/api/admin/reports/rep-1/x", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "vitest" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const params = { params: Promise.resolve({ id: "rep-1" }) };

type Payload = { data?: { report: unknown }; error?: { code: string; message: string } };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminAuth.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
  decideContentReport.mockResolvedValue({ id: "rep-1", status: "RESOLVED", resolvedAt: "2026-10-04T10:00:00.000Z" });
});

describe("POST /api/admin/reports/{id}/resolve|dismiss", () => {
  it("не администратор — ответ гарда, решение не принимается", async () => {
    requireAdminAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });
    const res = await resolve(req({ note: "x" }), params);
    expect(res.status).toBe(403);
    expect(decideContentReport).not.toHaveBeenCalled();
  });

  it("«Принять меры» без пометки — 400 с русским текстом", async () => {
    const res = await resolve(req({ note: "  " }), params);
    expect(res.status).toBe(400);
    const payload = (await res.json()) as Payload;
    expect(payload.error?.code).toBe("VALIDATION_ERROR");
    expect(decideContentReport).not.toHaveBeenCalled();
  });

  it("«Принять меры» с пометкой — решение RESOLVED от имени администратора", async () => {
    const res = await resolve(req({ note: " Отзыв удалён " }), params);
    expect(res.status).toBe(200);
    expect(decideContentReport).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: "rep-1", adminUserId: "admin-1", decision: "RESOLVED", note: "Отзыв удалён" }),
    );
  });

  it("«Отклонить» без тела и без пометки — DISMISSED, note null", async () => {
    const res = await dismiss(req(), params);
    expect(res.status).toBe(200);
    expect(decideContentReport).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "DISMISSED", note: null }),
    );
  });

  it("уже разобрана — 409 CONFLICT как есть", async () => {
    decideContentReport.mockRejectedValue(new AppError("Жалоба уже разобрана. Обновите страницу.", 409, "CONFLICT"));
    const res = await dismiss(req({ note: "нет нарушения" }), params);
    expect(res.status).toBe(409);
    expect(((await res.json()) as Payload).error?.code).toBe("CONFLICT");
  });
});
