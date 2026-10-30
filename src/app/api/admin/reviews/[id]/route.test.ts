import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADMIN-AUDIT-COVERAGE (SECURITY-EXPOSURE-AUDIT-01 · Y14) — легаси `PATCH`
 * (снять жалобу) и `DELETE` (удалить отзыв) выведены в 410: писали без
 * `AdminAuditLog`, а вызывающих не было. Проверка входа — первой.
 */

const requireAdminAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAuth }));

import { DELETE, PATCH } from "./route";

const UNAUTH = { ok: false as const, response: new Response("Unauthorized", { status: 401 }) };
const AUTH_OK = { ok: true as const, user: { id: "admin-1" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH/DELETE /api/admin/reviews/[id] выведены → 410", () => {
  it("PATCH отвечает 410 ENDPOINT_RETIRED администратору", async () => {
    requireAdminAuth.mockResolvedValue(AUTH_OK);
    const res = await PATCH();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe("ENDPOINT_RETIRED");
  });

  it("DELETE отвечает 410 ENDPOINT_RETIRED администратору", async () => {
    requireAdminAuth.mockResolvedValue(AUTH_OK);
    const res = await DELETE();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe("ENDPOINT_RETIRED");
  });

  it("вход проверяется ДО 410 — без входа 401, а не 410", async () => {
    requireAdminAuth.mockResolvedValue(UNAUTH);
    expect((await PATCH()).status).toBe(401);
    expect((await DELETE()).status).toBe(401);
  });
});
