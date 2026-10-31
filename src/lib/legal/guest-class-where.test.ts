import { describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { userProfile: { findUnique } } }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { isGuestClassProfile } from "@/lib/legal/consent";
import { GUEST_CLASS_PROFILE_WHERE } from "@/lib/legal/guest-class-where";

/**
 * MANUAL-BOOKING-CLIENT-LINK — условие «пассивный гостевой профиль» в запросе
 * и функция `isGuestClassProfile` проверяют ОДНИ И ТЕ ЖЕ поля. Иначе склейка
 * записей забрала бы бронь у профиля, который функция считает аккаунтом
 * (например, после того как к признаку добавили новую связь входа).
 *
 * @probe удалить `telegramId` из `GUEST_CLASS_PROFILE_WHERE` → тест падает
 *   на сравнении наборов полей («expected [...] to deeply equal [...]»).
 */
describe("GUEST_CLASS_PROFILE_WHERE", () => {
  it("покрывает ровно поля, которые читает isGuestClassProfile", async () => {
    findUnique.mockResolvedValueOnce(null);
    await isGuestClassProfile("u1");
    const select = findUnique.mock.calls[0]?.[0]?.select as Record<string, unknown>;
    const fromFunction = Object.keys(select)
      .flatMap((key) =>
        key === "_count" ? Object.keys((select._count as { select: Record<string, unknown> }).select) : [key],
      )
      .sort();
    expect(Object.keys(GUEST_CLASS_PROFILE_WHERE).sort()).toEqual(fromFunction);
  });

  it("роль — ровно CLIENT, сессий не было никогда", () => {
    expect(GUEST_CLASS_PROFILE_WHERE.roles).toEqual({ equals: ["CLIENT"] });
    expect(GUEST_CLASS_PROFILE_WHERE.refreshSessions).toEqual({ none: {} });
  });
});
