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
  userSubscription: { findMany: vi.fn(async () => []), deleteMany: vi.fn(), updateMany: vi.fn() },
  userProfile: { update: vi.fn(async () => ({})) },
  booking: { updateMany: vi.fn(), deleteMany: vi.fn() },
  review: { deleteMany: vi.fn() },
  clientCard: { deleteMany: vi.fn() },
  clientNote: { deleteMany: vi.fn() },
  mediaAsset: { deleteMany: vi.fn(), updateMany: vi.fn() },
  userConsent: { deleteMany: vi.fn() },
  adminAuditLog: { deleteMany: vi.fn() },
  studioInvite: { deleteMany: vi.fn(async () => ({ count: 0 })) },
}));

const prismaMock = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn() },
  masterProfile: { findUnique: vi.fn(async () => null) },
  studio: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
  booking: { count: vi.fn(async () => 0) },
  // DELETION-02: снимок медиа берётся ВНЕ транзакции, до неё.
  mediaAsset: { findMany: vi.fn(async () => []) },
  $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<void>) => cb(tx)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
// DELETION-02: постановка задачи на удаление медиа — отдельный модуль, здесь не проверяется.
vi.mock("@/lib/deletion/enqueue-media-purge", () => ({ enqueueMediaPurge: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({ alertWarning: vi.fn() }));
// 29.09 доработки · 26: приглашения на контакты удаляемого.
const invites = vi.hoisted(() => ({
  findPendingInvitesAddressedTo: vi.fn(async () => ({ inviteIds: [] as string[], stagedMasterIds: [] as string[] })),
  discardStagedMaster: vi.fn(async () => "deleted"),
}));
vi.mock("@/lib/invites/service", () => invites);
const cabinets = vi.hoisted(() => ({ deleteMasterCabinet: vi.fn(), deleteStudioCabinet: vi.fn() }));
vi.mock("@/lib/deletion/delete-master", () => ({ deleteMasterCabinet: cabinets.deleteMasterCabinet }));
vi.mock("@/lib/deletion/delete-studio", () => ({
  deleteStudioCabinet: cabinets.deleteStudioCabinet,
  ownedStudioWhere: (userId: string) => ({ ownerUserId: userId }),
}));

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
  prismaMock.studio.findMany.mockResolvedValue([]);
  prismaMock.booking.count.mockResolvedValue(0);
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

  // 29.09 доработки · 26 (решение владельца 26.2): раньше удалялись только
  // уведомления старше 30 дней, свежие жили вечно.
  it("удаляет ВСЕ уведомления удалённого — без границы по дате", async () => {
    await deleteUserAccount(USER_ID);
    expect(tx.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: [USER_ID] } } });
  });

  // 29.09 доработки · 00-6. @probe 2026-09-29 — ветка почты снята из
  // `otpOwners`: покраснел «коды входа — и по телефону, и по подтверждённой
  // почте». Условие `emailVerifiedAt` снято: покраснел «неподтверждённая почта —
  // чужие коды не трогаются». Возвращено — зелёный.
  it("коды входа — и по телефону, и по подтверждённой почте", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue({
      id: USER_ID,
      phone: "+79990001122",
      email: "Anna@Example.ru",
      emailVerifiedAt: new Date("2026-09-01T00:00:00Z"),
    });
    await deleteUserAccount(USER_ID);
    expect(tx.otpCode.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ phone: "+79990001122" }, { email: "anna@example.ru" }] },
    });
  });

  it("неподтверждённая почта — чужие коды не трогаются", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue({
      id: USER_ID,
      phone: null,
      email: "someone@example.ru",
      emailVerifiedAt: null,
    });
    await deleteUserAccount(USER_ID);
    expect(tx.otpCode.deleteMany).not.toHaveBeenCalled();
  });

  it("404s for a missing user", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(null);
    await expect(deleteUserAccount("nope")).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteUserAccount — 29.09 доработки · 26", () => {
  it("предстоящие записи клиента останавливают удаление (решение 26.1)", async () => {
    // кабинетов нет → единственный подсчёт — записи самого клиента
    prismaMock.booking.count.mockResolvedValueOnce(2);
    await expect(deleteUserAccount(USER_ID)).rejects.toMatchObject({
      code: "CLIENT_ACTIVE_BOOKINGS",
      status: 409,
      details: { count: 2 },
    });
    const where = (prismaMock.booking.count.mock.calls[0] as unknown as [{ where: { AND: unknown[] } }])[0].where;
    expect(where.AND).toContainEqual({ clientUserId: USER_ID });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("неотвеченные приглашения на подтверждённые контакты удаляются, заготовки — после коммита", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue({
      id: USER_ID,
      phone: "+79990001122",
      phoneVerifiedAt: new Date("2026-09-01T00:00:00Z"),
      email: "anna@example.ru",
      emailVerifiedAt: null,
    });
    invites.findPendingInvitesAddressedTo.mockResolvedValueOnce({ inviteIds: ["inv-1"], stagedMasterIds: ["staged-1"] });
    await deleteUserAccount(USER_ID);
    expect(invites.findPendingInvitesAddressedTo).toHaveBeenCalledWith({
      phone: "+79990001122",
      phoneVerified: true,
      email: "anna@example.ru",
      emailVerified: false,
    });
    expect(tx.studioInvite.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["inv-1"] }, status: "PENDING" } });
    expect(invites.discardStagedMaster).toHaveBeenCalledWith("staged-1");
  });

  it("юридические связи по-прежнему не трогаются, пока в политике KEEP", async () => {
    await deleteUserAccount(USER_ID, { deleteReviews: true });
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(tx.review.deleteMany).not.toHaveBeenCalled();
    expect(tx.clientCard.deleteMany).not.toHaveBeenCalled();
    expect(tx.userConsent.deleteMany).not.toHaveBeenCalled();
  });
});

describe("deleteUserAccount — DELETION-03", () => {
  it("живые записи в ЛЮБОМ кабинете останавливают удаление ДО удаления первого кабинета", async () => {
    prismaMock.masterProfile.findUnique.mockResolvedValue({ id: "mp", providerId: "prov-master" } as never);
    prismaMock.studio.findMany.mockResolvedValue([{ id: "st", providerId: "prov-studio" }] as never);
    // мастер чист, студия — нет
    prismaMock.booking.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);

    await expect(deleteUserAccount(USER_ID)).rejects.toMatchObject({ code: "ACTIVE_BOOKINGS" });
    expect(cabinets.deleteMasterCabinet).not.toHaveBeenCalled();
    expect(cabinets.deleteStudioCabinet).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("кабинеты удаляются без уведомления самому удаляемому", async () => {
    prismaMock.masterProfile.findUnique.mockResolvedValue({ id: "mp", providerId: "prov-master" } as never);
    await deleteUserAccount(USER_ID);
    expect(cabinets.deleteMasterCabinet).toHaveBeenCalledWith(USER_ID, { silent: true });
  });

  it("подписка с платежами остаётся, но автопродление и карта снимаются", async () => {
    tx.userSubscription.findMany.mockResolvedValue([
      { id: "free", _count: { payments: 0 } },
      { id: "paid", _count: { payments: 3 } },
    ] as never);
    await deleteUserAccount(USER_ID);
    expect(tx.userSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["free"] } } });
    expect(tx.userSubscription.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["paid"] } },
      data: { autoRenew: false, cancelAtPeriodEnd: true, nextBillingAt: null, paymentMethodId: null },
    });
  });
});
