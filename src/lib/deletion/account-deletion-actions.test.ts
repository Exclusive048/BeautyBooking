import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSenderType, MediaKind } from "@prisma/client";

/**
 * 29.09 доработки · 26 — действия политики удаления аккаунта. Пока политика
 * `KEEP`, в проде они не вызываются; здесь проверяется, что каждое делает ровно
 * своё и идемпотентно (условие «ещё не вычищено» — в `where` записи), чтобы
 * решение юриста включалось правкой константы.
 */

const recalc = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/reviews/recalculate-ratings", () => ({ recalculateTargetRatings: recalc }));

import {
  CLIENT_BOOKING_NOT_ANONYMIZED,
  anonymizeClientBookingsTx,
  anonymizeClientChatMessagesTx,
  anonymizeModelApplicationsTx,
  collectPolicyMedia,
  deleteAuthoredReviewsTx,
  deleteClientCardsTx,
  deleteClientNotesTx,
  deleteConsentsTx,
  deleteNotificationsTx,
} from "@/lib/deletion/account-deletion-actions";
import { buildPhoneVariantsForMatch } from "@/lib/bookings/link-guest-bookings";
import * as UI_TEXT from "@/lib/ui/text";

function fakeTx() {
  const many = () => vi.fn(async () => ({ count: 2 }));
  return {
    booking: { updateMany: many() },
    modelApplication: { deleteMany: many(), updateMany: many(), findMany: vi.fn(async () => [{ id: "app-1" }]) },
    chatMessage: { updateMany: many() },
    clientCard: { deleteMany: many() },
    clientNote: { deleteMany: many() },
    userConsent: { deleteMany: many() },
    notification: { deleteMany: many() },
    review: { findMany: vi.fn(async (): Promise<unknown[]> => []), deleteMany: many() },
    mediaAsset: { findMany: vi.fn(async () => [{ id: "m1", storageKey: "k1" }]) },
  };
}

type FakeTx = ReturnType<typeof fakeTx>;
const asTx = (tx: FakeTx) => tx as never;
const arg = (fn: { mock: { calls: unknown[][] } }) => fn.mock.calls[0]?.[0] as Record<string, unknown>;

let tx: FakeTx;
beforeEach(() => {
  vi.clearAllMocks();
  tx = fakeTx();
});

describe("записи клиента (Ю26.1)", () => {
  it("вычищает ПДн клиента, оставляя запись; повтор не трогает уже вычищенные", async () => {
    await anonymizeClientBookingsTx(asTx(tx), ["u1"]);
    const call = arg(tx.booking.updateMany);
    expect(call.where).toEqual({ clientUserId: { in: ["u1"] }, ...CLIENT_BOOKING_NOT_ANONYMIZED });
    expect(call.data).toEqual({
      clientName: UI_TEXT.deletion.deletedUserName,
      clientPhone: "",
      clientNameSnapshot: null,
      clientPhoneSnapshot: null,
      comment: null,
      referencePhotoAssetId: null,
    });
  });

  it("записанное значение не удовлетворяет условию «не вычищено» — идемпотентно", () => {
    const written = {
      clientName: UI_TEXT.deletion.deletedUserName,
      clientPhone: "",
      clientNameSnapshot: null,
      clientPhoneSnapshot: null,
      comment: null,
      referencePhotoAssetId: null,
    } as Record<string, unknown>;
    for (const clause of CLIENT_BOOKING_NOT_ANONYMIZED.OR) {
      const [field, cond] = Object.entries(clause)[0]! as [string, { not: unknown }];
      expect(written[field], field).toBe(cond.not);
    }
  });

  it("пустой телефон не склеивается поиском по телефону", () => {
    expect(buildPhoneVariantsForMatch("").variants).toEqual([]);
  });

  it("пустой набор — ни одного запроса", async () => {
    expect(await anonymizeClientBookingsTx(asTx(tx), [])).toBe(0);
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
  });
});

describe("отклики на модель-офферы", () => {
  it("без брони — удаляются, с бронью — без заметки", async () => {
    const result = await anonymizeModelApplicationsTx(asTx(tx), ["u1"]);
    expect(arg(tx.modelApplication.deleteMany).where).toEqual({ clientUserId: { in: ["u1"] }, bookingId: null });
    expect(arg(tx.modelApplication.updateMany)).toEqual({
      where: { clientUserId: { in: ["u1"] }, bookingId: { not: null }, clientNote: { not: null } },
      data: { clientNote: null },
    });
    expect(result).toEqual({ deleted: 2, anonymized: 2 });
  });
});

describe("переписка (Ю26.5)", () => {
  it("только сообщения клиента по его записям", async () => {
    await anonymizeClientChatMessagesTx(asTx(tx), ["u1"]);
    const call = arg(tx.chatMessage.updateMany);
    expect(call.where).toMatchObject({
      senderType: ChatSenderType.CLIENT,
      chat: { booking: { clientUserId: { in: ["u1"] } } },
    });
    expect(call.data).toEqual({
      body: UI_TEXT.deletion.deletedMessageBody,
      senderName: UI_TEXT.deletion.deletedUserName,
      attachmentMediaAssetId: null,
    });
  });
});

describe("удаления по связи", () => {
  it("карточки, заметки, согласия, уведомления — по своему ключу", async () => {
    await deleteClientCardsTx(asTx(tx), ["u1"]);
    await deleteClientNotesTx(asTx(tx), ["u1"]);
    await deleteConsentsTx(asTx(tx), ["u1"]);
    await deleteNotificationsTx(asTx(tx), ["u1"]);
    expect(arg(tx.clientCard.deleteMany)).toEqual({ where: { clientUserId: { in: ["u1"] } } });
    expect(arg(tx.clientNote.deleteMany)).toEqual({ where: { clientUserId: { in: ["u1"] } } });
    // Через единственный писатель согласий (инв. #37) и только у удалённых.
    expect(arg(tx.userConsent.deleteMany)).toEqual({ where: { userId: { in: ["u1"] }, user: { isDeleted: true } } });
    expect(arg(tx.notification.deleteMany)).toEqual({ where: { userId: { in: ["u1"] } } });
  });
});

describe("отзывы автора (Ю26.3)", () => {
  it("удаляются, рейтинг пересчитывается по активным целям в порядке targetId", async () => {
    tx.review.findMany.mockResolvedValue([
      { targetType: "provider", targetId: "p-b", masterId: null, deletedAt: null },
      { targetType: "studio", targetId: "p-a", masterId: "m-1", deletedAt: null },
      { targetType: "provider", targetId: "p-b", masterId: null, deletedAt: null },
      { targetType: "provider", targetId: "p-c", masterId: null, deletedAt: new Date() },
    ]);
    await deleteAuthoredReviewsTx(asTx(tx), ["u1"]);
    expect(arg(tx.review.deleteMany)).toEqual({ where: { authorId: { in: ["u1"] } } });
    const targets = (recalc.mock.calls as unknown as Array<[unknown, { targetId: string }]>).map((call) => call[1]);
    expect(targets).toEqual([
      { targetType: "studio", targetId: "p-a", masterId: "m-1" },
      { targetType: "provider", targetId: "p-b", masterId: null },
    ]);
  });

  it("нет отзывов — ничего не удаляется и не пересчитывается", async () => {
    expect(await deleteAuthoredReviewsTx(asTx(tx), ["u1"])).toBe(0);
    expect(tx.review.deleteMany).not.toHaveBeenCalled();
    expect(recalc).not.toHaveBeenCalled();
  });
});

describe("снимок медиа по связям", () => {
  it("без видов — ни одного запроса", async () => {
    expect(await collectPolicyMedia(asTx(tx), ["u1"], [])).toEqual([]);
    expect(tx.mediaAsset.findMany).not.toHaveBeenCalled();
  });

  it("каждый вид — через свою связь, а не через автора загрузки", async () => {
    await collectPolicyMedia(asTx(tx), ["u1"], [
      MediaKind.CLIENT_CARD_PHOTO,
      MediaKind.BOOKING_REFERENCE,
      MediaKind.CHAT_ATTACHMENT,
      MediaKind.MODEL_APPLICATION_PHOTO,
    ]);
    const where = arg(tx.mediaAsset.findMany).where as { deletedAt: null; OR: Array<Record<string, unknown>> };
    expect(where.deletedAt).toBeNull();
    expect(where.OR).toEqual([
      { kind: MediaKind.CLIENT_CARD_PHOTO, clientCardPhotos: { some: { card: { clientUserId: { in: ["u1"] } } } } },
      { kind: MediaKind.BOOKING_REFERENCE, bookingReferences: { some: { clientUserId: { in: ["u1"] } } } },
      {
        kind: MediaKind.CHAT_ATTACHMENT,
        chatMessageAttachments: {
          some: { senderType: ChatSenderType.CLIENT, chat: { booking: { clientUserId: { in: ["u1"] } } } },
        },
      },
      { kind: MediaKind.MODEL_APPLICATION_PHOTO, entityType: "MODEL_APPLICATION", entityId: { in: ["app-1"] } },
    ]);
    expect(JSON.stringify(where)).not.toContain("createdByUserId");
  });
});
