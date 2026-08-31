import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PHONE-CLAIM-01 — гостевой чекаут против кабинетных заявок на номер.
 *
 * Пины трёх исходов `findOrCreateGuestUserByPhone` при занятом номере:
 *  - доказанный владелец → бронь прикрепляется к нему (владелец сам бронирует
 *    разлогиненным — задуманное поведение);
 *  - guest-class пассивный профиль → прикрепляется (прежний путь);
 *  - чужая ЗАЯВКА (established, без доказательства) → НЕ прикрепляется
 *    («guest-booking takeover», SECURITY-EXPOSURE-AUDIT-01 #2): создаётся
 *    БЕЗНОМЕРНОЙ пассивный профиль, а заявка держателя НЕ трогается — анонимный
 *    POST не должен уметь мутировать чужой аккаунт.
 *
 * @probe Прогнан со сломанным входом: ветка FOREIGN_CLAIM, возвращающая
 * `existing`, валит тест «не прикрепляется» (expected 'u-orphan', got
 * 'u-claimer'); ветка, пишущая phone в orphan-профиль, валит проверку
 * отсутствия ключа (expected undefined, got '+7999…').
 */

const findUnique = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const ensureRoles = vi.hoisted(() => vi.fn());
const guestClassMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { userProfile: { findUnique, create } },
}));
vi.mock("@/lib/auth/roles", () => ({
  ensureClientRoleForUser: ensureRoles,
}));
vi.mock("@/lib/legal/consent", () => ({
  isGuestClassProfile: guestClassMock,
}));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import { findOrCreateGuestUserByPhone } from "@/lib/users/find-or-create-guest";

const PHONE = "+79991234567";

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  ensureRoles.mockReset();
  guestClassMock.mockReset();
  ensureRoles.mockImplementation(async (_id: string, roles: string[]) => roles);
  create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "u-orphan",
    roles: ["CLIENT"],
    ...data,
  }));
});

describe("гостевой чекаут и заявки на номер (PHONE-CLAIM-01)", () => {
  it("доказанный владелец: бронь прикрепляется к нему", async () => {
    const owner = { id: "u-owner", roles: ["CLIENT"], phoneVerifiedAt: new Date() };
    findUnique.mockResolvedValueOnce(owner);

    const result = await findOrCreateGuestUserByPhone({ phone: PHONE });

    expect(result.profile.id).toBe("u-owner");
    expect(result.wasCreated).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(guestClassMock).not.toHaveBeenCalled();
  });

  it("guest-class пассивный профиль: прикрепляется (прежний путь)", async () => {
    const guest = { id: "u-guest", roles: ["CLIENT"], phoneVerifiedAt: null };
    findUnique.mockResolvedValueOnce(guest);
    guestClassMock.mockResolvedValueOnce(true);

    const result = await findOrCreateGuestUserByPhone({ phone: PHONE });

    expect(result.profile.id).toBe("u-guest");
    expect(result.wasCreated).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("чужая заявка (established): НЕ прикрепляется — безномерной пассивный профиль", async () => {
    const claimer = { id: "u-claimer", roles: ["CLIENT"], phoneVerifiedAt: null };
    findUnique.mockResolvedValueOnce(claimer);
    guestClassMock.mockResolvedValueOnce(false);

    const result = await findOrCreateGuestUserByPhone({
      phone: PHONE,
      displayName: "Гость",
    });

    expect(result.profile.id).toBe("u-orphan");
    expect(result.wasCreated).toBe(true);
    // Ключевое: у orphan-профиля НЕТ телефона (номер занят заявкой держателя,
    // и трогать её анонимным запросом нельзя).
    const createdData = create.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(createdData.phone).toBeUndefined();
    expect(createdData.displayName).toBe("Гость");
  });
});
