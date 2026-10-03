import { NotificationType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import * as UI_TEXT from "@/lib/ui/text";
import {
  NATIVE_PUSH_DATA_KEYS,
  NATIVE_PUSH_SPECS,
  audienceFromWebUrl,
  buildNativePushMessage,
} from "@/lib/notifications/native-push/payload";
import { NATIVE_PUSH_CHANNELS } from "@/lib/notifications/native-push/types";

/**
 * MOBILE-B2 — push в приложение без ПДн, по построению.
 *
 * Push идёт через Google / Apple / VK и показывается на заблокированном
 * экране. Сторож гоняет КАЖДЫЙ `NotificationType` с payload, набитым ПДн (так
 * выглядят реальные payload записи и чата: имя клиента, услуга, мастер,
 * превью сообщения), со всеми сторонами получателя — и требует, чтобы ни один
 * кусок ПДн не попал ни в заголовок, ни в текст, ни в `data`.
 *
 * @probe 2026-10-03 — в `buildNativePushMessage` `body` заменён на
 * `String(payload.bodyPreview ?? …)`: 3 красных («ни один тип не пропускает
 * ПДн», «payload как JSON-строка», «только общие строки»). В `ENTITY_ID_KEYS`
 * добавлен `"clientNameLatin"` (латинское имя `Ivan` проходит `ID_PATTERN`):
 * 2 красных с именами типов и полем `clientNameLatin`. Возвращено — зелёный.
 * Отсюда правило: белый список id расширяется только ключами, которые
 * отправители заполняют id, а не «похожим на id» значением.
 */

const PII = {
  clientName: "Анна Смирнова",
  clientNameLatin: "Ivan",
  clientPhone: "+79991234567",
  clientEmail: "anna@example.com",
  masterName: "Мария Петрова",
  providerName: "Студия Лотос",
  serviceName: "Маникюр с покрытием",
  address: "ул. Ленина, 5",
  bodyPreview: "Перезвоните мне на 8 999 123-45-67",
  senderName: "Ольга",
  comment: "Опоздаю на 10 минут",
};

const PII_PAYLOAD = {
  bookingId: "cbooking000000000000000001",
  chatId: "cchat0000000000000000000001",
  conversationSlug: "Ab3dE5gH7j",
  messageId: "cmsg00000000000000000000001",
  reviewId: "creview00000000000000000001",
  offerId: "coffer000000000000000000001",
  applicationId: "capp0000000000000000000001",
  hotSlotId: "chot000000000000000000001",
  bookingStatus: "PENDING",
  clientName: PII.clientName,
  clientNameLatin: PII.clientNameLatin,
  clientPhone: PII.clientPhone,
  clientEmail: PII.clientEmail,
  masterName: PII.masterName,
  providerName: PII.providerName,
  serviceName: PII.serviceName,
  address: PII.address,
  bodyPreview: PII.bodyPreview,
  senderName: PII.senderName,
  comment: PII.comment,
  startAtUtc: "2026-10-05T09:00:00.000Z",
};

const WEB_URLS = [
  "/cabinet/master/dashboard?focus=cbooking000000000000000001",
  "/cabinet/studio/calendar?view=day&focus=cbooking000000000000000001",
  "/cabinet/bookings?focus=cbooking000000000000000001",
  "/cabinet/master/messages?c=Ab3dE5gH7j",
  "/notifications",
  null,
];

const ALL_TYPES = Object.values(NotificationType);

describe("ПДн в push не попадают (все типы × все стороны)", () => {
  it("таблица покрывает каждый NotificationType", () => {
    expect(Object.keys(NATIVE_PUSH_SPECS).sort()).toEqual([...ALL_TYPES].sort());
  });

  it("ни один тип не пропускает ПДн — ни в тексте, ни в data", () => {
    const leaks: string[] = [];
    for (const type of ALL_TYPES) {
      for (const webUrl of WEB_URLS) {
        const message = buildNativePushMessage({
          type,
          notificationId: "cnotif0000000000000000001",
          payloadJson: PII_PAYLOAD,
          webUrl,
          tag: "chat:cchat0000000000000000000001",
        });
        if (!message) continue;
        const serialized = JSON.stringify(message);
        for (const [field, value] of Object.entries(PII)) {
          if (serialized.includes(value)) leaks.push(`${type} @ ${webUrl}: ${field}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it("payload как JSON-строка — так же", () => {
    const message = buildNativePushMessage({
      type: "CHAT_MESSAGE_RECEIVED",
      payloadJson: JSON.stringify(PII_PAYLOAD),
      webUrl: "/cabinet/messages?c=Ab3dE5gH7j",
    });
    expect(message).not.toBeNull();
    for (const value of Object.values(PII)) expect(JSON.stringify(message)).not.toContain(value);
    expect(message!.data.conversationSlug).toBe("Ab3dE5gH7j");
  });

  it("ПДн, положенные в поле id, не проходят: id — только [A-Za-z0-9_-]", () => {
    const message = buildNativePushMessage({
      type: "BOOKING_CONFIRMED",
      payloadJson: { bookingId: PII.clientName, chatId: PII.clientPhone, reviewId: PII.clientEmail },
      webUrl: "/cabinet/bookings",
    });
    expect(message!.data.bookingId).toBeUndefined();
    expect(message!.data.chatId).toBeUndefined();
    expect(message!.data.reviewId).toBeUndefined();
    expect(JSON.stringify(message)).not.toContain(PII.clientPhone);
  });

  it("заголовок и текст — только общие строки домена `nativePush`", () => {
    const allowed = new Set<string>();
    const walk = (value: unknown) => {
      if (typeof value === "string") allowed.add(value);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(UI_TEXT.nativePush);
    for (const type of ALL_TYPES) {
      const message = buildNativePushMessage({ type, payloadJson: PII_PAYLOAD, webUrl: WEB_URLS[0] });
      if (!message) continue;
      expect(allowed.has(message.title), `${type} title`).toBe(true);
      expect(allowed.has(message.body), `${type} body`).toBe(true);
    }
  });

  it("data — только строки и только ключи контракта", () => {
    const allowedKeys = new Set<string>(NATIVE_PUSH_DATA_KEYS);
    for (const type of ALL_TYPES) {
      for (const webUrl of WEB_URLS) {
        const message = buildNativePushMessage({ type, notificationId: "n1", payloadJson: PII_PAYLOAD, webUrl });
        if (!message) continue;
        for (const [key, value] of Object.entries(message.data)) {
          expect(allowedKeys.has(key), `${type}: unexpected key ${key}`).toBe(true);
          expect(typeof value).toBe("string");
        }
        expect(message.data.v).toBe("1");
        expect(message.data.type).toBe(type);
        expect(message.data.link.startsWith("/")).toBe(true);
        expect(NATIVE_PUSH_CHANNELS).toContain(message.androidChannelId);
        expect(message.data.channelId).toBe(message.androidChannelId);
      }
    }
  });
});

describe("какие типы уходят в приложение", () => {
  it("биллинг и удаление кабинета — нет", () => {
    for (const type of ALL_TYPES.filter((t) => t.startsWith("BILLING_"))) {
      expect(buildNativePushMessage({ type, payloadJson: {} }), type).toBeNull();
    }
    expect(buildNativePushMessage({ type: "SUBSCRIPTION_GRANTED_BY_ADMIN" })).toBeNull();
    expect(buildNativePushMessage({ type: "MASTER_CABINET_DELETED" })).toBeNull();
  });

  it("записи, чат, отзывы, студия, модели, окошки — да", () => {
    for (const type of [
      "BOOKING_CREATED",
      "BOOKING_REMINDER_2H",
      "CHAT_MESSAGE_RECEIVED",
      "REVIEW_LEFT",
      "STUDIO_INVITE_RECEIVED",
      "MODEL_TIME_PROPOSED",
      "HOT_SLOT_AVAILABLE",
      "MASTER_WEEKLY_STATS",
    ] as const) {
      expect(buildNativePushMessage({ type }), type).not.toBeNull();
    }
  });
});

describe("сторона получателя и путь экрана", () => {
  it("сторона — из веб-ссылки отправителя", () => {
    expect(audienceFromWebUrl("/cabinet/master/dashboard?focus=x")).toBe("master");
    expect(audienceFromWebUrl("/cabinet/master")).toBe("master");
    expect(audienceFromWebUrl("/cabinet/studio/calendar?focus=x")).toBe("studio");
    expect(audienceFromWebUrl("/cabinet/bookings?focus=x")).toBe("client");
    expect(audienceFromWebUrl("/cabinet/masterclass")).toBe("client");
    expect(audienceFromWebUrl("/notifications")).toBeNull();
    expect(audienceFromWebUrl(undefined)).toBeNull();
  });

  const bookingPayload = { bookingId: "b1", bookingStatus: "CONFIRMED" };

  it.each([
    ["/cabinet/bookings?focus=b1", "/bookings/b1"],
    ["/cabinet/master/dashboard?focus=b1", "/master/bookings/b1"],
    ["/cabinet/studio/calendar?view=day&focus=b1", "/studio/bookings/b1"],
    ["/cabinet/bookings", "/bookings"],
    ["/cabinet/master/dashboard", "/master/bookings"],
    ["/cabinet/studio/calendar", "/studio/calendar"],
    [undefined, "/notifications"],
  ])("запись: %s → %s", (webUrl, link) => {
    const message = buildNativePushMessage({ type: "BOOKING_CONFIRMED", payloadJson: bookingPayload, webUrl });
    expect(message!.data.link).toBe(link);
    expect(message!.data.bookingId).toBe("b1");
  });

  it("отзыв после визита — экран отзыва", () => {
    const message = buildNativePushMessage({
      type: "BOOKING_COMPLETED_REVIEW",
      payloadJson: { bookingId: "b1" },
      webUrl: "/cabinet/bookings?focus=b1&review=b1",
    });
    expect(message!.data.link).toBe("/bookings/b1/review");
  });

  it("чат — по публичному slug, одна плашка на переписку", () => {
    const master = buildNativePushMessage({
      type: "CHAT_MESSAGE_RECEIVED",
      payloadJson: { chatId: "c1", conversationSlug: "Ab3dE5gH7j" },
      webUrl: "/cabinet/master/messages?c=Ab3dE5gH7j",
      tag: "chat:c1",
    });
    expect(master!.data.link).toBe("/master/chats/Ab3dE5gH7j");
    expect(master!.collapseKey).toBe("chat:c1");
    expect(master!.threadId).toBe("chat:c1");
    expect(master!.androidChannelId).toBe("messages");

    const client = buildNativePushMessage({
      type: "CHAT_MESSAGE_RECEIVED",
      payloadJson: { chatId: "c1", conversationSlug: "Ab3dE5gH7j" },
      webUrl: "/cabinet/messages?c=Ab3dE5gH7j",
    });
    expect(client!.data.link).toBe("/chats/Ab3dE5gH7j");
    expect(client!.collapseKey).toBe("chat:c1");
  });

  it("модели: мастеру — предложение, клиенту — заявка", () => {
    const ids = { offerId: "o1", applicationId: "a1" };
    expect(
      buildNativePushMessage({ type: "MODEL_NEW_APPLICATION", payloadJson: ids, webUrl: "/cabinet/master/model-offers" })!
        .data.link,
    ).toBe("/master/model-offers/o1");
    expect(
      buildNativePushMessage({ type: "MODEL_TIME_PROPOSED", payloadJson: ids, webUrl: "/cabinet/model-applications" })!
        .data.link,
    ).toBe("/model-applications/a1");
  });

  it("каналы Android: записи, сообщения, акции, прочее", () => {
    expect(buildNativePushMessage({ type: "BOOKING_REMINDER_24H" })!.androidChannelId).toBe("bookings");
    expect(buildNativePushMessage({ type: "HOT_SLOT_AVAILABLE" })!.androidChannelId).toBe("promo");
    expect(buildNativePushMessage({ type: "STUDIO_INVITE_RECEIVED" })!.androidChannelId).toBe("general");
  });

  it("notificationId — только если похож на id", () => {
    expect(buildNativePushMessage({ type: "REVIEW_LEFT", notificationId: "n_1" })!.data.notificationId).toBe("n_1");
    expect(buildNativePushMessage({ type: "REVIEW_LEFT", notificationId: "a b" })!.data.notificationId).toBeUndefined();
  });
});

describe("«Подтвердить / Отклонить» у новой записи", () => {
  const masterUrl = "/cabinet/master/dashboard?focus=b1";

  it.each(["PENDING", "NEW"])("мастеру, запись %s — действия и текст «ждёт подтверждения»", (bookingStatus) => {
    const message = buildNativePushMessage({
      type: "BOOKING_CREATED",
      payloadJson: { bookingId: "b1", bookingStatus },
      webUrl: masterUrl,
    });
    expect(message!.actions).toBe("BOOKING_DECISION");
    expect(message!.data.actions).toBe("BOOKING_DECISION");
    expect(message!.body).toBe(UI_TEXT.nativePush.booking.awaitingDecision);
    expect(message!.data.link).toBe("/master/bookings/b1");
  });

  it("уже подтверждённая (автоподтверждение) — без действий", () => {
    const message = buildNativePushMessage({
      type: "BOOKING_CREATED",
      payloadJson: { bookingId: "b1", bookingStatus: "CONFIRMED" },
      webUrl: masterUrl,
    });
    expect(message!.actions).toBeUndefined();
    expect(message!.data.actions).toBeUndefined();
    expect(message!.body).toBe(UI_TEXT.nativePush.booking.createdBody);
  });

  it("студии и клиенту — без действий", () => {
    for (const webUrl of ["/cabinet/studio/calendar?focus=b1", "/cabinet/bookings?focus=b1"]) {
      const message = buildNativePushMessage({
        type: "BOOKING_REQUEST",
        payloadJson: { bookingId: "b1", bookingStatus: "PENDING" },
        webUrl,
      });
      expect(message!.actions, webUrl).toBeUndefined();
    }
  });

  it("другие типы записи — без действий", () => {
    const message = buildNativePushMessage({
      type: "BOOKING_RESCHEDULE_REQUESTED",
      payloadJson: { bookingId: "b1", bookingStatus: "PENDING" },
      webUrl: masterUrl,
    });
    expect(message!.actions).toBeUndefined();
  });
});
