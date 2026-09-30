import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Правка пояса города в админке доходит до провайдеров этого города, у кого
 * пояс совпадал с прежним поясом города (он выведен из города при сохранении
 * адреса). Выбравшие пояс вручную — не трогаются.
 *
 * @probe 2026-09-29 — из `where` убрано условие `timezone: existing.timezone`:
 * покраснел «правка пояса — только у совпадавших» (в where не было timezone).
 * Возвращено — зелёный.
 * @probe 2026-09-29 — `updateMany` вызывался и при неизменном поясе (условие
 * `!== existing.timezone` снято): покраснел «тот же пояс — провайдеров не трогает».
 * Возвращено — зелёный.
 */

const requireAdminAuth = vi.hoisted(() => vi.fn());
const cityFindUnique = vi.hoisted(() => vi.fn());
const cityUpdate = vi.hoisted(() => vi.fn());
const providerUpdateMany = vi.hoisted(() => vi.fn());
const createAdminAuditLog = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAuth }));
vi.mock("@/lib/prisma", () => {
  const tx = { city: { update: cityUpdate }, provider: { updateMany: providerUpdateMany } };
  return {
    prisma: {
      city: { findUnique: cityFindUnique },
      $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    },
  };
});
vi.mock("@/lib/audit/admin-audit", () => ({ createAdminAuditLog }));
vi.mock("@/lib/audit/admin-audit-context", () => ({ getAdminAuditContext: () => ({}) }));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import { PATCH } from "./route";

const ctx = { params: Promise.resolve({ id: "city-1" }) };

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/admin/cities/city-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminAuth.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
  cityFindUnique.mockResolvedValue({
    id: "city-1",
    name: "Самара",
    autoCreated: true,
    timezone: "Europe/Moscow",
  });
  cityUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "city-1",
    slug: "samara",
    ...data,
  }));
  providerUpdateMany.mockResolvedValue({ count: 3 });
});

describe("PATCH /api/admin/cities/[id] — пояс города", () => {
  it("правка пояса — только у совпадавших с прежним поясом города", async () => {
    const res = await patch({ timezone: "Europe/Samara" });

    expect(res.status).toBe(200);
    expect(providerUpdateMany).toHaveBeenCalledWith({
      where: { cityId: "city-1", timezone: "Europe/Moscow" },
      data: { timezone: "Europe/Samara" },
    });
    expect(createAdminAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CITY_UPDATED",
        details: expect.objectContaining({ providersRetimed: 3 }),
      }),
    );
  });

  it("тот же пояс — провайдеров не трогает", async () => {
    await patch({ timezone: "Europe/Moscow", name: "Самара" });
    expect(providerUpdateMany).not.toHaveBeenCalled();
  });

  it("без пояса в запросе — провайдеров не трогает", async () => {
    await patch({ name: "Самара" });
    expect(providerUpdateMany).not.toHaveBeenCalled();
  });
});
