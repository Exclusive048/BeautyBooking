import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

/**
 * MOBILE-POLISH (App Store 1.2) — `POST /api/reports`: вход обязателен,
 * лимит до записи (обрыв Redis — 503, путь чувствительный), отказ валидации —
 * текстом поля и `fieldErrors`, 201 — новая жалоба, 200 — уже есть открытая.
 *
 * @probe  вернуть `jsonOk(result, { status: 201 })` без ветки alreadyReported →
 *         красный «повтор — 200 alreadyReported».
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn());
const createContentReport = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/access", () => ({ getSessionUser }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/moderation/content-reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/moderation/content-reports")>();
  return { ...actual, createContentReport };
});
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req_1",
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const { POST } = await import("@/app/api/reports/route");

function call(body: unknown) {
  return POST(
    new Request("https://app.test/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

type Payload = {
  data?: { id: string; alreadyReported: boolean };
  error?: { message: string; code: string; fieldErrors?: Record<string, string> };
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ userId: "u1", roles: [] });
  checkRateLimit.mockResolvedValue({ limited: false });
  createContentReport.mockResolvedValue({ id: "rep-1", alreadyReported: false });
});

describe("POST /api/reports", () => {
  it("без входа — 401, жалоба не создаётся", async () => {
    getSessionUser.mockRejectedValue(new AppError("Требуется вход в аккаунт.", 401, "UNAUTHORIZED"));
    const res = await call({ targetType: "PROVIDER", targetId: "anna", reason: "SPAM" });
    expect(res.status).toBe(401);
    expect(createContentReport).not.toHaveBeenCalled();
  });

  it("обрыв лимитера — 503 RATE_LIMIT_UNAVAILABLE; исчерпан — 429", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 60, reason: "unavailable" });
    let res = await call({ targetType: "PROVIDER", targetId: "anna", reason: "SPAM" });
    expect(res.status).toBe(503);
    expect(((await res.json()) as Payload).error?.code).toBe("RATE_LIMIT_UNAVAILABLE");

    checkRateLimit.mockResolvedValue({ limited: true, retryAfterSeconds: 60 });
    res = await call({ targetType: "PROVIDER", targetId: "anna", reason: "SPAM" });
    expect(res.status).toBe(429);
    expect(createContentReport).not.toHaveBeenCalled();
  });

  it("лимит считается по пользователю и шаблону пути", async () => {
    await call({ targetType: "PROVIDER", targetId: "anna", reason: "SPAM" });
    const [key, options] = checkRateLimit.mock.calls[0] as [string, { maxRequests: number; windowSeconds: number }];
    expect(key).toMatch(/^rl:route:user:.+:\/api\/reports$/);
    expect(options).toEqual({ maxRequests: 20, windowSeconds: 3600 });
  });

  it("OTHER без комментария — 400 текстом поля и fieldErrors.comment", async () => {
    const res = await call({ targetType: "PROVIDER", targetId: "anna", reason: "OTHER" });
    expect(res.status).toBe(400);
    const payload = (await res.json()) as Payload;
    expect(payload.error?.code).toBe("VALIDATION_ERROR");
    expect(payload.error?.message).toMatch(/комментарий/);
    expect(payload.error?.fieldErrors?.comment).toBe(payload.error?.message);
    expect(createContentReport).not.toHaveBeenCalled();
  });

  it("новая жалоба — 201; повтор — 200 alreadyReported", async () => {
    let res = await call({ targetType: "REVIEW", targetId: "e_abc", reason: "OFFENSIVE", comment: " грубость " });
    expect(res.status).toBe(201);
    expect(((await res.json()) as Payload).data).toEqual({ id: "rep-1", alreadyReported: false });
    expect(createContentReport).toHaveBeenCalledWith({
      targetType: "REVIEW",
      targetId: "e_abc",
      reason: "OFFENSIVE",
      comment: "грубость",
      reporterUserId: "u1",
    });

    createContentReport.mockResolvedValue({ id: "rep-1", alreadyReported: true });
    res = await call({ targetType: "REVIEW", targetId: "e_abc", reason: "OFFENSIVE" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Payload).data?.alreadyReported).toBe(true);
  });

  it("отказы сервиса (404, свой контент) проходят как есть", async () => {
    createContentReport.mockRejectedValue(new AppError("На свой контент пожаловаться нельзя.", 400, "REPORT_OWN_CONTENT"));
    const res = await call({ targetType: "PROVIDER", targetId: "me", reason: "SPAM" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Payload).error?.code).toBe("REPORT_OWN_CONTENT");
  });

  it("сбой — 500 с русским текстом", async () => {
    createContentReport.mockRejectedValue(new Error("db down"));
    const res = await call({ targetType: "PROVIDER", targetId: "anna", reason: "SPAM" });
    expect(res.status).toBe(500);
    expect(((await res.json()) as Payload).error?.message).toBe("Не удалось отправить жалобу. Попробуйте ещё раз.");
  });
});
