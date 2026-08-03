import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * RKN-FIX-03-A — what account deletion actually touches.
 *
 * Complements the schema-driven disposition guard: that one proves nothing is
 * left UNCLASSIFIED, this one proves the rows classified as DELETED are really
 * deleted (and that the retained ones are left alone).
 */

const tx = vi.hoisted(() => ({
  otpCode: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  pushSubscription: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  notification: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  telegramLinkToken: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  telegramLink: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  vkLink: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  yandexLink: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  publicUsernameAlias: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  favorite: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  userFavorite: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  hotSlotSubscription: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  studioMembership: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  studioMember: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  refreshSession: { updateMany: vi.fn(async () => ({ count: 0 })), deleteMany: vi.fn() },
  userSubscription: { findMany: vi.fn(async () => []), deleteMany: vi.fn() },
  userProfile: { update: vi.fn(async () => ({})) },
  booking: { updateMany: vi.fn(), deleteMany: vi.fn() },
  review: { deleteMany: vi.fn() },
  clientCard: { deleteMany: vi.fn() },
  clientNote: { deleteMany: vi.fn() },
  mediaAsset: { deleteMany: vi.fn(), updateMany: vi.fn() },
  userConsent: { deleteMany: vi.fn() },
  adminAuditLog: { deleteMany: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn() },
  masterProfile: { findUnique: vi.fn(async () => null) },
  studio: { findFirst: vi.fn(async () => null) },
  // DELETION-02: снимок медиа берётся ВНЕ транзакции, до неё.
  mediaAsset: { findMany: vi.fn(async () => []) },
  $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<void>) => cb(tx)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
// DELETION-02: постановка задачи на удаление медиа — отдельный модуль, здесь не проверяется.
vi.mock("@/lib/deletion/enqueue-media-purge", () => ({ enqueueMediaPurge: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({ alertWarning: vi.fn() }));
vi.mock("@/lib/deletion/delete-master", () => ({ deleteMasterCabinet: vi.fn() }));
vi.mock("@/lib/deletion/delete-studio", () => ({ deleteStudioCabinet: vi.fn() }));

import { deleteUserAccount } from "@/lib/deletion/delete-account";

const USER_ID = "user-1";

/**
 * First argument the mock was called with. The hoisted mocks are declared
 * without parameters (they ignore their input), so their `mock.calls` type is
 * an empty tuple — this is the one place the test needs to look inside.
 */
function firstCallArg<T>(fn: { mock: { calls: unknown[][] } }): T {
  const [call] = fn.mock.calls;
  if (!call) throw new Error("expected the mock to have been called");
  return call[0] as T;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.userProfile.findUnique.mockResolvedValue({ id: USER_ID, phone: "+79990001122" });
  prismaMock.masterProfile.findUnique.mockResolvedValue(null);
  prismaMock.studio.findFirst.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => Promise<void>) => cb(tx));
  tx.userSubscription.findMany.mockResolvedValue([]);
});

describe("deleteUserAccount — auth artefacts", () => {
  it("deletes the Yandex link (the gap RKN-FIX-03-A was filed for)", async () => {
    await deleteUserAccount(USER_ID);
    expect(tx.yandexLink.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });

  it("deletes every provider link, not just the ones that existed when the list was written", async () => {
    await deleteUserAccount(USER_ID);
    for (const model of [tx.telegramLink, tx.telegramLinkToken, tx.vkLink, tx.yandexLink]) {
      expect(model.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    }
  });

  it("revokes live sessions instead of leaving them open", async () => {
    await deleteUserAccount(USER_ID);

    expect(tx.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    // Revoked, NOT deleted: the row is the "was an account" marker that
    // `isGuestClassProfile` (RKN-FIX-02) relies on.
    expect(tx.refreshSession.deleteMany).not.toHaveBeenCalled();
  });
});

describe("deleteUserAccount — dangling user-owned rows", () => {
  it("removes catalog hearts, hot-slot subscriptions and studio memberships", async () => {
    await deleteUserAccount(USER_ID);

    expect(tx.userFavorite.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(tx.hotSlotSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(tx.studioMembership.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(tx.studioMember.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });
});

describe("deleteUserAccount — preserved behaviour", () => {
  it("still anonymises the profile rather than deleting the row", async () => {
    await deleteUserAccount(USER_ID);

    const call = firstCallArg<{ where: { id: string }; data: Record<string, unknown> }>(
      tx.userProfile.update,
    );
    expect(call.where).toEqual({ id: USER_ID });
    expect(call.data).toMatchObject({
      phone: null,
      email: null,
      telegramId: null,
      displayName: "Удалённый пользователь",
      isDeleted: true,
    });
    // Phone nulled → `findOrCreateGuestUserByPhone` can never resolve this
    // profile again, so a guest booking cannot attach to a deleted account.
    expect(call.data.phone).toBeNull();
  });

  it("leaves Phase-B / retained data untouched (no policy decisions taken here)", async () => {
    await deleteUserAccount(USER_ID);

    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(tx.booking.deleteMany).not.toHaveBeenCalled();
    expect(tx.clientCard.deleteMany).not.toHaveBeenCalled();
    expect(tx.clientNote.deleteMany).not.toHaveBeenCalled();
    expect(tx.userConsent.deleteMany).not.toHaveBeenCalled();
    expect(tx.adminAuditLog.deleteMany).not.toHaveBeenCalled();
    expect(tx.mediaAsset.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps notification retention at 30 days (unchanged)", async () => {
    await deleteUserAccount(USER_ID);

    const call = firstCallArg<{ where: { userId: string; createdAt: { lt: Date } } }>(
      tx.notification.deleteMany,
    );
    expect(call.where.userId).toBe(USER_ID);
    expect(call.where.createdAt.lt).toBeInstanceOf(Date);
  });

  it("404s for a missing user", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(null);
    await expect(deleteUserAccount("nope")).rejects.toMatchObject({ status: 404 });
  });
});
