import type { NotificationType } from "@prisma/client";
import * as UI_TEXT from "@/lib/ui/text";
import {
  BOOKING_DECISION_ACTIONS,
  NATIVE_PUSH_PAYLOAD_VERSION,
  type NativePushChannel,
  type NativePushMessage,
} from "@/lib/notifications/native-push/types";

/**
 * MOBILE-B2 — из уведомления продукта в push нативного приложения.
 *
 * 🔴 ПДн в push нет по построению, а не по аккуратности отправителей:
 *  · заголовок и текст — ОБЩИЕ, по типу события (`UI_TEXT.nativePush`), а не
 *    title/body уведомления (там имя клиента, услуга, текст сообщения);
 *  · из `payloadJson` берутся только id сущностей из белого списка
 *    `ENTITY_ID_KEYS`, и каждый обязан выглядеть как id (`ID_PATTERN`) — имя,
 *    положенное отправителем «не в то поле», не пройдёт;
 *  · путь экрана собирается здесь из тех же id, веб-ссылка отправителя
 *    читается только ради стороны получателя (кабинет мастера / студии /
 *    клиент) и наружу не уходит.
 * Сторож — `payload.test.ts` (все типы × payload, набитый ПДн).
 *
 * Какие типы уходят в push и как выглядят — ОДНА таблица ниже. Она
 * `Record<NotificationType, …>`: новый тип в `enums.prisma` без решения здесь не
 * собирается (как `NOTIFICATION_TYPE_PURPOSE`). `null` — тип в приложение не
 * пушится (остаётся в центре уведомлений, вебе, почте).
 */

type Audience = "client" | "master" | "studio";

type LinkRule =
  /** Экран записи по стороне получателя; без id записи в веб-ссылке — список. */
  | { kind: "booking"; review?: true }
  /** Чат по `conversationSlug` (тот же публичный slug, что у `/api/chat/threads/{slug}`). */
  | { kind: "chat" }
  /** Модельные предложения: мастеру — предложение, клиенту — его заявка. */
  | { kind: "model" }
  | { kind: "byAudience"; client: string; master: string; studio: string }
  | { kind: "fixed"; path: string };

type NativePushSpec = {
  title: string;
  body: string;
  channel: NativePushChannel;
  link: LinkRule;
  /** «Подтвердить / Отклонить» — только мастеру и только пока запись ждёт решения. */
  bookingDecision?: true;
  /** Текст для записи, ждущей решения мастера (вместо `body`). */
  awaitingBody?: string;
};

const T = UI_TEXT.nativePush;
const NOTIFICATIONS_LINK = "/notifications";

const booking = (title: string, body: string = T.details, extra: Partial<NativePushSpec> = {}): NativePushSpec => ({
  title,
  body,
  channel: "bookings",
  link: { kind: "booking" },
  ...extra,
});

const general = (title: string, path: string = NOTIFICATIONS_LINK, body: string = T.details): NativePushSpec => ({
  title,
  body,
  channel: "general",
  link: { kind: "fixed", path },
});

const model = (title: string, body: string = T.details): NativePushSpec => ({
  title,
  body,
  channel: "general",
  link: { kind: "model" },
});

/**
 * Решения по исключённым типам (`null`):
 *  · `BILLING_*`, `SUBSCRIPTION_GRANTED_BY_ADMIN` — подписка оформляется и
 *    оплачивается только в вебе; push о платежах в iOS-приложении — риск отказа
 *    в App Store (3.1.1 / 3.1.3, «уводит к оплате мимо IAP»). Остаются веб-push,
 *    почта и центр уведомлений;
 *  · `MASTER_CABINET_DELETED` — человек удалил кабинет сам, скорее всего с
 *    этого же устройства.
 */
export const NATIVE_PUSH_SPECS = {
  BOOKING_CREATED: booking(T.booking.created, T.booking.createdBody, {
    bookingDecision: true,
    awaitingBody: T.booking.awaitingDecision,
  }),
  BOOKING_REQUEST: booking(T.booking.created, T.booking.createdBody, {
    bookingDecision: true,
    awaitingBody: T.booking.awaitingDecision,
  }),
  BOOKING_CONFIRMED: booking(T.booking.confirmed),
  BOOKING_DECLINED: booking(T.booking.rescheduleDeclined, T.booking.rescheduleDeclinedBody),
  BOOKING_REJECTED: booking(T.booking.rejected),
  BOOKING_CANCELLED: booking(T.booking.cancelled),
  BOOKING_CANCELLED_BY_MASTER: booking(T.booking.cancelled),
  BOOKING_CANCELLED_BY_CLIENT: booking(T.booking.cancelled),
  BOOKING_RESCHEDULED: booking(T.booking.changed, T.booking.changedBody),
  BOOKING_RESCHEDULE_REQUESTED: booking(T.booking.rescheduleRequested, T.booking.rescheduleRequestedBody),
  BOOKING_REMINDER_24H: booking(T.booking.reminder, T.booking.reminder24hBody),
  BOOKING_REMINDER_2H: booking(T.booking.reminder, T.booking.reminder2hBody),
  BOOKING_COMPLETED_REVIEW: booking(T.booking.reviewPrompt, T.booking.reviewPromptBody, {
    link: { kind: "booking", review: true },
  }),
  BOOKING_NO_SHOW: booking(T.booking.noShow),

  CHAT_MESSAGE_RECEIVED: {
    title: T.chat.message,
    body: T.chat.messageBody,
    channel: "messages",
    link: { kind: "chat" },
  },

  REVIEW_LEFT: {
    title: T.review.left,
    body: T.review.leftBody,
    channel: "general",
    link: { kind: "byAudience", client: NOTIFICATIONS_LINK, master: "/master/reviews", studio: "/studio/reviews" },
  },
  REVIEW_REPLIED: booking(T.review.replied, T.review.repliedBody, { channel: "general" }),
  REVIEW_DELETED_BY_ADMIN: general(T.review.deleted),

  STUDIO_INVITE_RECEIVED: general(T.studio.inviteReceived),
  STUDIO_INVITE_ACCEPTED: general(T.studio.inviteAccepted),
  STUDIO_INVITE_REJECTED: general(T.studio.inviteRejected),
  STUDIO_MEMBER_LEFT: general(T.studio.memberLeft),
  STUDIO_MEMBER_REMOVED: general(T.studio.memberRemoved),
  STUDIO_SCHEDULE_REQUEST: general(T.studio.scheduleRequest),
  STUDIO_SCHEDULE_APPROVED: general(T.studio.scheduleApproved),
  STUDIO_SCHEDULE_REJECTED: general(T.studio.scheduleRejected),
  STUDIO_DISBANDED: general(T.studio.disbanded),
  STUDIO_SCHEDULE_ENDING: general(T.studio.scheduleEnding, "/studio/team", T.studio.scheduleEndingBody),
  SCHEDULE_ENDING: general(T.schedule.ending, "/master/calendar", T.schedule.endingBody),
  MASTER_CABINET_DELETED: null,

  MODEL_NEW_APPLICATION: model(T.model.application, T.model.applicationBody),
  MODEL_APPLICATION_RECEIVED: model(T.model.application, T.model.applicationBody),
  MODEL_APPLICATION_REJECTED: model(T.model.applicationRejected),
  MODEL_TIME_PROPOSED: model(T.model.timeProposed, T.model.timeProposedBody),
  MODEL_BOOKING_CREATED: model(T.model.bookingCreated),
  MODEL_TIME_CONFIRMED: model(T.model.timeConfirmed),

  // Рекламный тип: без согласия на рекламу уведомление не создаётся вовсе
  // (`deliverNotification`, 29.09 доработки · 16), отдельный канал — чтобы
  // человек мог выключить акции в настройках Android, не теряя записи.
  HOT_SLOT_AVAILABLE: { ...general(T.hotSlot.available, NOTIFICATIONS_LINK, T.hotSlot.availableBody), channel: "promo" },
  SLOT_FREED: general(T.hotSlot.freed, NOTIFICATIONS_LINK, T.hotSlot.freedBody),
  HOT_SLOT_PUBLISHED: general(T.hotSlot.published, "/master/today"),
  HOT_SLOT_BOOKED: general(T.hotSlot.booked, "/master/today", T.hotSlot.bookedBody),
  HOT_SLOT_EXPIRING: general(T.hotSlot.expiring, "/master/today", T.hotSlot.expiringBody),
  MASTER_WEEKLY_STATS: general(T.stats.weekly, "/master/analytics", T.stats.weeklyBody),

  CATEGORY_APPROVED: general(T.category.approved),
  CATEGORY_REJECTED: general(T.category.rejected),

  BILLING_PAYMENT_SUCCEEDED: null,
  BILLING_PAYMENT_FAILED: null,
  BILLING_RENEWAL_CONFIRMATION_REQUIRED: null,
  BILLING_RENEWAL_PRICE_INCREASE: null,
  BILLING_SUBSCRIPTION_CANCELLED: null,
  BILLING_SUBSCRIPTION_EXPIRED: null,
  BILLING_TRIAL_ENDING_SOON: null,
  BILLING_TRIAL_EXPIRED: null,
  BILLING_PLAN_GRANTED_BY_ADMIN: null,
  BILLING_PLAN_EDITED: null,
  BILLING_SUBSCRIPTION_CANCELLED_BY_ADMIN: null,
  BILLING_PAYMENT_REFUNDED: null,
  SUBSCRIPTION_GRANTED_BY_ADMIN: null,
} as const satisfies Record<NotificationType, NativePushSpec | null>;

/**
 * Id сущностей, которые push может нести. Всё прочее из `payloadJson` (имена,
 * услуги, время, текст, причина отказа…) не читается вовсе.
 */
export const ENTITY_ID_KEYS = [
  "bookingId",
  "chatId",
  "conversationSlug",
  "reviewId",
  "offerId",
  "applicationId",
  "hotSlotId",
] as const;
type EntityIdKey = (typeof ENTITY_ID_KEYS)[number];

/** cuid / uuid / публичный slug чата: буквы, цифры, `-`, `_`. Иное — не id. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Все ключи `data`, которые может нести push (контракт приложения). */
export const NATIVE_PUSH_DATA_KEYS = [
  "v",
  "type",
  "link",
  "title",
  "body",
  "channelId",
  "notificationId",
  "actions",
  "badge",
  ...ENTITY_ID_KEYS,
] as const;

/** Статусы записи, ждущей решения мастера (`bookingStatus` из payload записи). */
const AWAITING_DECISION_STATUSES = new Set(["PENDING", "NEW"]);

export type NativePushSource = {
  type: NotificationType;
  /** Id строки `Notification` — приложение отмечает её прочитанной по нажатию. */
  notificationId?: string | null;
  payloadJson?: unknown;
  /**
   * Веб-ссылка, которую выбрал отправитель (`pushUrl`). Только чтобы узнать
   * сторону получателя: `/cabinet/master…` — мастер, `/cabinet/studio…` —
   * студия, прочий `/cabinet/…` — клиент. Наружу не уходит.
   */
  webUrl?: string | null;
  /** Ключ схлопывания веб-push (`chat:<id>`) — тот же для приложения. */
  tag?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function readId(value: unknown): string | null {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : null;
}

export function audienceFromWebUrl(webUrl: string | null | undefined): Audience | null {
  if (!webUrl) return null;
  const path = webUrl.split(/[?#]/)[0] ?? "";
  if (path === "/cabinet/master" || path.startsWith("/cabinet/master/")) return "master";
  if (path === "/cabinet/studio" || path.startsWith("/cabinet/studio/")) return "studio";
  if (path.startsWith("/cabinet/")) return "client";
  return null;
}

const enc = encodeURIComponent;

function bookingLink(
  audience: Audience | null,
  bookingId: string | null,
  webUrl: string | null | undefined,
  review: boolean,
): string {
  // Экран конкретной записи — только если и отправитель вёл на неё: «запись
  // передана другому мастеру» уходит прежнему мастеру со ссылкой на список, и
  // открывать ему запись, которая больше не его, нельзя.
  const pointed = bookingId !== null && Boolean(webUrl?.includes(bookingId));
  switch (audience) {
    case "client":
      return pointed ? `/bookings/${enc(bookingId!)}${review ? "/review" : ""}` : "/bookings";
    case "master":
      return pointed ? `/master/bookings/${enc(bookingId!)}` : "/master/bookings";
    case "studio":
      return pointed ? `/studio/bookings/${enc(bookingId!)}` : "/studio/calendar";
    default:
      return NOTIFICATIONS_LINK;
  }
}

function chatLink(audience: Audience | null, slug: string | null): string {
  const prefix = audience === "master" ? "/master/chats" : audience === "studio" ? "/studio/chats" : "/chats";
  if (audience === null) return NOTIFICATIONS_LINK;
  return slug ? `${prefix}/${enc(slug)}` : prefix;
}

function modelLink(audience: Audience | null, ids: Partial<Record<EntityIdKey, string>>): string {
  if (audience === "master" || audience === "studio") {
    return ids.offerId ? `/master/model-offers/${enc(ids.offerId)}` : "/master/model-offers";
  }
  if (audience === "client") {
    return ids.applicationId ? `/model-applications/${enc(ids.applicationId)}` : "/model-applications";
  }
  return NOTIFICATIONS_LINK;
}

function resolveLink(
  rule: LinkRule,
  audience: Audience | null,
  ids: Partial<Record<EntityIdKey, string>>,
  webUrl: string | null | undefined,
): string {
  switch (rule.kind) {
    case "booking":
      return bookingLink(audience, ids.bookingId ?? null, webUrl, rule.review === true);
    case "chat":
      return chatLink(audience, ids.conversationSlug ?? null);
    case "model":
      return modelLink(audience, ids);
    case "byAudience":
      return audience ? rule[audience] : NOTIFICATIONS_LINK;
    case "fixed":
      return rule.path;
  }
}

/** Ключ схлопывания/группы: только из id, длина ≤ 64 (предел `apns-collapse-id`). */
function sanitizeKey(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return /^[A-Za-z0-9:_-]{1,64}$/.test(value) ? value : undefined;
}

/**
 * Push-сообщение для уведомления или `null`, если тип в приложение не пушится.
 * Чистая функция: ни БД, ни env — сторож проверяет её напрямую.
 */
export function buildNativePushMessage(source: NativePushSource): NativePushMessage | null {
  const spec: NativePushSpec | null = NATIVE_PUSH_SPECS[source.type] ?? null;
  if (!spec) return null;

  const payload = asRecord(source.payloadJson);
  const ids: Partial<Record<EntityIdKey, string>> = {};
  for (const key of ENTITY_ID_KEYS) {
    const id = readId(payload[key]);
    if (id) ids[key] = id;
  }

  const audience = audienceFromWebUrl(source.webUrl);
  const link = resolveLink(spec.link, audience, ids, source.webUrl);

  const awaitingDecision =
    spec.bookingDecision === true &&
    audience === "master" &&
    ids.bookingId !== undefined &&
    link.startsWith("/master/bookings/") &&
    typeof payload.bookingStatus === "string" &&
    AWAITING_DECISION_STATUSES.has(payload.bookingStatus);

  const body = awaitingDecision && spec.awaitingBody ? spec.awaitingBody : spec.body;

  const data: Record<string, string> = {
    v: NATIVE_PUSH_PAYLOAD_VERSION,
    type: source.type,
    link,
    title: spec.title,
    body,
    channelId: spec.channel,
  };
  const notificationId = readId(source.notificationId);
  if (notificationId) data.notificationId = notificationId;
  for (const key of ENTITY_ID_KEYS) {
    const id = ids[key];
    if (id) data[key] = id;
  }
  if (awaitingDecision) data.actions = BOOKING_DECISION_ACTIONS;

  const chatKey = ids.chatId ? `chat:${ids.chatId}` : undefined;
  const collapseKey = spec.channel === "messages" ? sanitizeKey(source.tag) ?? sanitizeKey(chatKey) : undefined;
  const threadId =
    spec.channel === "messages"
      ? collapseKey
      : ids.bookingId && spec.channel === "bookings"
        ? sanitizeKey(`booking:${ids.bookingId}`)
        : undefined;

  return {
    type: source.type,
    title: spec.title,
    body,
    data,
    androidChannelId: spec.channel,
    ...(collapseKey ? { collapseKey } : {}),
    ...(threadId ? { threadId } : {}),
    ...(awaitingDecision ? { actions: BOOKING_DECISION_ACTIONS } : {}),
  };
}
