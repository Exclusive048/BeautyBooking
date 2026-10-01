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
 */

const assertAccountDeletable = vi.hoisted(() => vi.fn(async () => ({})));
const deleteUserAccount = vi.hoisted(() => vi.fn(async () => undefined));
const checkRateLimit = vi.hoisted(() => vi.fn(async () => ({ limited: false })));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: vi.fn(async () => ({ ok: true, user: { id: "u1" } })),
}));
vi.mock("@/lib/deletion/delete-account", () => ({ assertAccountDeletable, deleteUserAccount }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
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

  it("лишний параметр запроса — 400", async () => {
    const res = await call("?deleteReviews=yes");
    expect(res.status).toBe(400);
    expect(deleteUserAccount).not.toHaveBeenCalled();
  });
});
