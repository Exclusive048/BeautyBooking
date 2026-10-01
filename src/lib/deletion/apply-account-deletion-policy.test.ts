import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 26 — применение политики удаления: что выполняется в
 * транзакции удаления аккаунта, что — отложенным проходом, и что ничего не
 * происходит, пока решение не принято.
 */

const actions = vi.hoisted(() => ({
  anonymizeClientBookingsTx: vi.fn(async () => 1),
  anonymizeClientChatMessagesTx: vi.fn(async () => 1),
  anonymizeModelApplicationsTx: vi.fn(async () => ({ deleted: 0, anonymized: 0 })),
  collectPolicyMedia: vi.fn(async () => [{ id: "m1", storageKey: "k1" }]),
  deleteAuthoredReviewsTx: vi.fn(async () => 1),
  deleteClientCardsTx: vi.fn(async () => 1),
  deleteClientNotesTx: vi.fn(async () => 1),
  deleteConsentsTx: vi.fn(async () => 1),
  deleteNotificationsTx: vi.fn(async () => 1),
}));
vi.mock("@/lib/deletion/account-deletion-actions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/deletion/account-deletion-actions")>();
  return { ...actions, CLIENT_BOOKING_NOT_ANONYMIZED: original.CLIENT_BOOKING_NOT_ANONYMIZED };
});

const prismaMock = vi.hoisted(() => ({
  userProfile: { findMany: vi.fn(async (): Promise<Array<{ id: string }>> => []) },
  $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const purge = vi.hoisted(() => ({ enqueueMediaPurge: vi.fn(async () => undefined) }));
vi.mock("@/lib/deletion/enqueue-media-purge", () => purge);
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import {
  applyPolicyAtDeletionTx,
  deletesReviewsAtDeletion,
  mediaKindsAtDeletion,
  runDeferredAccountDeletionPolicy,
} from "@/lib/deletion/apply-account-deletion-policy";
import { ACCOUNT_DELETION_POLICY, type AccountDeletionPolicy } from "@/lib/deletion/account-deletion-policy";

const tx = { notification: { deleteMany: vi.fn(async () => ({ count: 0 })) } };
const NOW = new Date("2026-10-01T12:00:00Z");

const ACTIVE: AccountDeletionPolicy = {
  bookings: { kind: "ANONYMIZE_NOW" },
  modelApplications: { kind: "ANONYMIZE_NOW" },
  chatMessages: { kind: "ANONYMIZE_NOW" },
  consents: { kind: "DELETE_AFTER", months: 36 },
  reviewsAuthored: { kind: "DELETE" },
  clientCards: { kind: "DELETE" },
  clientNotes: { kind: "DELETE" },
  notifications: { kind: "DELETE" },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.userProfile.findMany.mockResolvedValue([]);
});

describe("в транзакции удаления", () => {
  it("политика сегодня: удаляются все уведомления, остальное не трогается", async () => {
    await applyPolicyAtDeletionTx(tx as never, "u1", {}, ACCOUNT_DELETION_POLICY, NOW);
    expect(actions.deleteNotificationsTx).toHaveBeenCalledWith(tx, ["u1"]);
    for (const fn of [
      actions.anonymizeClientBookingsTx,
      actions.anonymizeModelApplicationsTx,
      actions.anonymizeClientChatMessagesTx,
      actions.deleteClientCardsTx,
      actions.deleteClientNotesTx,
      actions.deleteAuthoredReviewsTx,
      actions.deleteConsentsTx,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(mediaKindsAtDeletion()).toEqual([]);
  });

  it("уведомления KEEP — прежнее поведение: только старше 30 дней", async () => {
    await applyPolicyAtDeletionTx(tx as never, "u1", {}, { ...ACCOUNT_DELETION_POLICY, notifications: { kind: "KEEP" } }, NOW);
    expect(actions.deleteNotificationsTx).not.toHaveBeenCalled();
    expect(tx.notification.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", createdAt: { lt: new Date("2026-09-01T12:00:00Z") } },
    });
  });

  it("все решения включены: каждое действие «сразу» выполняется, отложенное — нет", async () => {
    await applyPolicyAtDeletionTx(tx as never, "u1", {}, ACTIVE, NOW);
    for (const fn of [
      actions.anonymizeClientBookingsTx,
      actions.anonymizeModelApplicationsTx,
      actions.anonymizeClientChatMessagesTx,
      actions.deleteClientCardsTx,
      actions.deleteClientNotesTx,
      actions.deleteAuthoredReviewsTx,
      actions.deleteNotificationsTx,
    ]) {
      expect(fn).toHaveBeenCalledWith(tx, ["u1"]);
    }
    expect(actions.deleteConsentsTx).not.toHaveBeenCalled();
    expect(mediaKindsAtDeletion(ACTIVE).sort()).toEqual(
      ["BOOKING_REFERENCE", "CHAT_ATTACHMENT", "CLIENT_CARD_PHOTO", "MODEL_APPLICATION_PHOTO"].sort(),
    );
  });

  it("USER_CHOICE: отзывы удаляются только по галочке", () => {
    const policy: AccountDeletionPolicy = { ...ACCOUNT_DELETION_POLICY, reviewsAuthored: { kind: "USER_CHOICE" } };
    expect(deletesReviewsAtDeletion({ deleteReviews: true }, policy)).toBe(true);
    expect(deletesReviewsAtDeletion({}, policy)).toBe(false);
    // При KEEP галочка не действует, даже если пришла.
    expect(deletesReviewsAtDeletion({ deleteReviews: true }, ACCOUNT_DELETION_POLICY)).toBe(false);
  });
});

describe("отложенный проход", () => {
  it("политика сегодня — ни одного чтения", async () => {
    const summary = await runDeferredAccountDeletionPolicy(NOW);
    expect(summary).toEqual({ bookingsAnonymized: 0, consentsDeleted: 0 });
    expect(prismaMock.userProfile.findMany).not.toHaveBeenCalled();
  });

  it("ANONYMIZE_AFTER 36: граница — удалённые раньше 2023-10-01, только где ещё есть ПДн", async () => {
    const policy: AccountDeletionPolicy = { ...ACCOUNT_DELETION_POLICY, bookings: { kind: "ANONYMIZE_AFTER", months: 36 } };
    prismaMock.userProfile.findMany.mockResolvedValueOnce([{ id: "u1" }, { id: "u2" }]);
    const summary = await runDeferredAccountDeletionPolicy(NOW, policy);
    const where = (prismaMock.userProfile.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0]
      .where;
    expect(where.isDeleted).toBe(true);
    expect(where.deletedAt).toEqual({ lt: new Date("2023-10-01T12:00:00Z") });
    expect(where.bookings).toBeDefined();
    expect(actions.anonymizeClientBookingsTx).toHaveBeenCalledWith({}, ["u1", "u2"]);
    expect(actions.collectPolicyMedia).toHaveBeenCalledWith(prismaMock, ["u1", "u2"], ["BOOKING_REFERENCE"]);
    expect(purge.enqueueMediaPurge).toHaveBeenCalledWith([{ id: "m1", storageKey: "k1" }], "account-deletion", null);
    expect(summary.bookingsAnonymized).toBe(1);
  });

  it("повторный прогон без кандидатов ничего не меняет", async () => {
    const policy: AccountDeletionPolicy = { ...ACCOUNT_DELETION_POLICY, bookings: { kind: "ANONYMIZE_AFTER", months: 36 } };
    const summary = await runDeferredAccountDeletionPolicy(NOW, policy);
    expect(summary).toEqual({ bookingsAnonymized: 0, consentsDeleted: 0 });
    expect(actions.anonymizeClientBookingsTx).not.toHaveBeenCalled();
    expect(purge.enqueueMediaPurge).not.toHaveBeenCalled();
  });

  it("пачка без изменений — проход останавливается, а не крутится", async () => {
    const policy: AccountDeletionPolicy = { ...ACCOUNT_DELETION_POLICY, bookings: { kind: "ANONYMIZE_AFTER", months: 36 } };
    prismaMock.userProfile.findMany.mockResolvedValue(Array.from({ length: 200 }, (_, i) => ({ id: `u${i}` })));
    actions.anonymizeClientBookingsTx.mockResolvedValueOnce(0);
    await runDeferredAccountDeletionPolicy(NOW, policy);
    expect(prismaMock.userProfile.findMany).toHaveBeenCalledTimes(1);
  });

  it("DELETE_AFTER 36 у согласий — по тем, у кого они ещё есть", async () => {
    const policy: AccountDeletionPolicy = { ...ACCOUNT_DELETION_POLICY, consents: { kind: "DELETE_AFTER", months: 36 } };
    prismaMock.userProfile.findMany.mockResolvedValueOnce([{ id: "u9" }]);
    const summary = await runDeferredAccountDeletionPolicy(NOW, policy);
    const where = (prismaMock.userProfile.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0]
      .where;
    expect(where).toEqual({ isDeleted: true, deletedAt: { lt: new Date("2023-10-01T12:00:00Z") }, consents: { some: {} } });
    expect(actions.deleteConsentsTx).toHaveBeenCalledWith({}, ["u9"]);
    expect(summary.consentsDeleted).toBe(1);
  });
});
