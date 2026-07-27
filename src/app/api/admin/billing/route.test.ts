import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SECURITY-EXPOSURE-AUDIT-01 · Y14 (FIX-LEGACY-BILLING-ROUTE-01) — the legacy
 * `POST` (create plan) and `PATCH` (edit code/tier/scope) handlers are retired
 * to 410 Gone, but the admin auth guard still runs first. GET stays live.
 */

const requireAdminAuth = vi.hoisted(() => vi.fn());
const billingPlanFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAuth }));
vi.mock("@/lib/prisma", () => ({ prisma: { billingPlan: { findMany: billingPlanFindMany } } }));
// `fail`/`ok` come from response.ts, which pulls monitoring/observability —
// keep them real (they don't report for <500) so we exercise the true status.

import { GET, POST, PATCH } from "./route";

const UNAUTH = { ok: false as const, response: new Response("Unauthorized", { status: 401 }) };
const AUTH_OK = { ok: true as const, user: { id: "admin-1" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST/PATCH /api/admin/billing retired → 410", () => {
  it("POST returns 410 for an authenticated admin", async () => {
    requireAdminAuth.mockResolvedValue(AUTH_OK);
    const res = await POST();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe("ENDPOINT_RETIRED");
  });

  it("PATCH returns 410 for an authenticated admin", async () => {
    requireAdminAuth.mockResolvedValue(AUTH_OK);
    const res = await PATCH();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe("ENDPOINT_RETIRED");
  });

  it("auth runs BEFORE the 410 — an unauthenticated caller gets 401, not 410", async () => {
    requireAdminAuth.mockResolvedValue(UNAUTH);
    expect((await POST()).status).toBe(401);
    expect((await PATCH()).status).toBe(401);
  });

  it("GET still lists plans (untouched)", async () => {
    requireAdminAuth.mockResolvedValue(AUTH_OK);
    billingPlanFindMany.mockResolvedValue([{ id: "p1" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.plans).toHaveLength(1);
  });
});
