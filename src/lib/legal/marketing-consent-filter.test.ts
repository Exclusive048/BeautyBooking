import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 16 — кто дал согласие на рекламу: одним запросом, любая
 * АКТИВНАЯ строка `MARKETING` (`revokedAt: null`) любой версии документа
 * (решение 16.1 — поднятие версии не выключает акции молча).
 */

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { userConsent: { findMany } } }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { filterUsersWithMarketingConsent } from "@/lib/legal/consent";

beforeEach(() => findMany.mockReset());

describe("filterUsersWithMarketingConsent", () => {
  it("спрашивает только активные строки MARKETING, без условия на версию, одним запросом", async () => {
    findMany.mockResolvedValueOnce([{ userId: "u1" }]);
    const result = await filterUsersWithMarketingConsent(["u1", "u2", "u1"]);
    expect(findMany).toHaveBeenCalledTimes(1);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toEqual({ userId: { in: ["u1", "u2"] }, consentType: "MARKETING", revokedAt: null });
    expect(where).not.toHaveProperty("documentVersion");
    expect([...result]).toEqual(["u1"]);
  });

  it("пустой список — без запроса", async () => {
    expect((await filterUsersWithMarketingConsent([])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
