import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

/**
 * DELETE-CABINET-REFUSAL-RATE-LIMIT — отказ удаления кабинета из-за живых
 * записей не расходует лимит частоты (`destructiveDelete`, 1 в час). Зеркало
 * `api/me/delete/route.test.ts` для кабинетов мастера и студии.
 *
 * @probe 2026-10-01 — предпроверка убрана из роута мастера: покраснел
 * «master: отказ — без обращения к лимиту». Возвращено — зелёный.
 */

const checkRateLimit = vi.hoisted(() => vi.fn(async () => ({ limited: false })));
const master = vi.hoisted(() => ({ assert: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }));
const studio = vi.hoisted(() => ({ assert: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: vi.fn(async () => ({ ok: true, user: { id: "u1" } })),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/deletion/delete-master", () => ({
  assertMasterCabinetDeletable: master.assert,
  deleteMasterCabinet: master.remove,
}));
vi.mock("@/lib/deletion/delete-studio", () => ({
  assertStudioCabinetDeletable: studio.assert,
  deleteStudioCabinet: studio.remove,
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), getRequestId: () => "req" }));

import { DELETE as deleteMaster } from "./master/delete/route";
import { DELETE as deleteStudio } from "./studio/delete/route";

beforeEach(() => vi.clearAllMocks());

const cases = [
  { name: "master", handler: deleteMaster, mocks: master },
  { name: "studio", handler: deleteStudio, mocks: studio },
] as const;

describe.each(cases)("DELETE /api/cabinet/$name/delete", ({ name, handler, mocks }) => {
  it(`${name}: отказ — без обращения к лимиту`, async () => {
    mocks.assert.mockRejectedValueOnce(new AppError("Есть активные записи", 409, "ACTIVE_BOOKINGS", { count: 3 }));
    const res = await handler(new Request(`http://localhost/api/cabinet/${name}/delete`, { method: "DELETE" }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; details?: { count: number } } };
    expect(body.error.code).toBe("ACTIVE_BOOKINGS");
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it(`${name}: удаление — после лимита`, async () => {
    const res = await handler(new Request(`http://localhost/api/cabinet/${name}/delete`, { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledWith("u1");
  });
});
