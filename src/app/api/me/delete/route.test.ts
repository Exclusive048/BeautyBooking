import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

/**
 * 29.09 доработки · 26 — отказ из-за живых записей не расходует лимит частоты.
 *
 * Лимит удаления — одна попытка в час (`destructiveDelete`). Если отказ «сначала
 * отмените предстоящие записи» её съедал, человек, сделавший ровно то, что ему
 * сказали, следующий час получал «Слишком часто» — нашёл живой прогон
 * `.qa/spec26-account-deletion.spec.ts`.
 *
 * @probe 2026-10-01 — `assertAccountDeletable` перенесён в роуте ПОСЛЕ проверки
 * лимита: покраснел «отказ — без обращения к лимиту» (`checkRateLimit` вызван
 * дважды). Возвращено — зелёный.
 *
 * MOBILE-CLIENT-01 (B7) — неудачная попытка не запирает повтор на час:
 *  · запрос разбирается ДО лимита (опечатка в параметре попытку не тратит);
 *  · удаление упало по вине сервера (5xx) — попытка возвращается в оба ведра;
 *  · отказ по существу (4xx изнутри удаления) и успех — попытка израсходована.
 *
 * @probe 2026-10-03 — разбор запроса возвращён ПОСЛЕ лимита: покраснел
 *        «лишний параметр запроса — 400 без обращения к лимиту» (`checkRateLimit`
 *        вызван дважды). Возвращено — зелёный.
 * @probe 2026-10-03 — возврат попытки в `catch` убран: покраснел «сбой
 *        удаления (5xx) — попытка возвращается в оба ведра». Возвращено — зелёный.
 */

const assertAccountDeletable = vi.hoisted(() => vi.fn(async () => ({})));
const deleteUserAccount = vi.hoisted(() => vi.fn(async () => undefined));
const checkRateLimit = vi.hoisted(() =>
  vi.fn<(key: string) => Promise<{ limited: boolean }>>(async () => ({ limited: false })),
);
const refundRateLimit = vi.hoisted(() => vi.fn<(key: string) => Promise<void>>(async () => undefined));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: vi.fn(async () => ({ ok: true, user: { id: "u1" } })),
}));
vi.mock("@/lib/deletion/delete-account", () => ({ assertAccountDeletable, deleteUserAccount }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, refundRateLimit }));
vi.mock("@/lib/auth/session", () => ({ clearSessionCookies: vi.fn() }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), getRequestId: () => "req" }));

import { DELETE } from "./route";

function call(query = "") {
  return DELETE(new Request(`http://localhost/api/me/delete${query}`, { method: "DELETE" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/me/delete", () => {
  it("отказ из-за предстоящих записей — 409 без обращения к лимиту", async () => {
    assertAccountDeletable.mockRejectedValueOnce(
      new AppError("Сначала отмените предстоящие записи (2 шт.).", 409, "CLIENT_ACTIVE_BOOKINGS", { count: 2 }),
    );
    const res = await call();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("CLIENT_ACTIVE_BOOKINGS");
    expect(body.error.message).toContain("Сначала отмените предстоящие записи");
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(deleteUserAccount).not.toHaveBeenCalled();
  });

  it("удаление — после проверки лимита, галочка отзывов доходит до сервиса", async () => {
    const res = await call("?deleteReviews=1");
    expect(res.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    expect(deleteUserAccount).toHaveBeenCalledWith("u1", { deleteReviews: true });
  });

  it("лишний параметр запроса — 400 без обращения к лимиту", async () => {
    const res = await call("?deleteReviews=yes");
    expect(res.status).toBe(400);
    expect(deleteUserAccount).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("сбой удаления (5xx) — попытка возвращается в оба ведра", async () => {
    deleteUserAccount.mockRejectedValueOnce(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    const spentKeys = checkRateLimit.mock.calls.map(([key]) => key);
    expect(spentKeys).toHaveLength(2);
    expect(refundRateLimit.mock.calls.map(([key]) => key).sort()).toEqual([...spentKeys].sort());
  });

  it("успех — попытка израсходована", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(refundRateLimit).not.toHaveBeenCalled();
  });

  it("отказ изнутри удаления (4xx) — попытка израсходована", async () => {
    deleteUserAccount.mockRejectedValueOnce(
      new AppError("Есть активные записи", 409, "ACTIVE_BOOKINGS", { count: 1 }),
    );
    const res = await call();
    expect(res.status).toBe(409);
    expect(refundRateLimit).not.toHaveBeenCalled();
  });

  it("лимит аккаунта исчерпан — 429, попытка адреса не тратится", async () => {
    checkRateLimit.mockResolvedValueOnce({ limited: false }).mockResolvedValueOnce({ limited: true });
    const res = await call();
    expect(res.status).toBe(429);
    expect(deleteUserAccount).not.toHaveBeenCalled();
    expect(refundRateLimit).toHaveBeenCalledTimes(1);
    expect(refundRateLimit).toHaveBeenCalledWith(checkRateLimit.mock.calls[0]?.[0]);
  });
});
