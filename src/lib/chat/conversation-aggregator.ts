import { ChatSenderType, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isBookingChatOpen } from "@/lib/chat/status";
import {
  getOrCreateConversationSlug,
  type ConversationKey,
} from "@/lib/chat/conversation-slug";
import {
  injectDaySeparators,
  type ThreadItem,
} from "@/lib/chat/thread-grouping";
import type { ConversationParticipant } from "@/lib/chat/conversation-access";
import { buildChatAttachmentUrl } from "@/lib/media/private-delivery";
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor";
import { CHAT_THREAD_PAGE_SIZE, chatConversationsWindowStart } from "@/lib/chat/conversation-window";
import { getChatBlockStates } from "@/lib/chat/blocks";

/**
 * Per-pair conversation aggregator (33a, updated by chat-url-fix).
 *
 * The schema stores ChatMessage per BookingChat per Booking. The UI
 * wants per-person threads — one entry per (provider, client) pair,
 * regardless of how many bookings they share. This file is the
 * translation layer.
 *
 * Key calls:
 *   - listConversations  → ConversationListItem[] (sidebar list)
 *   - getThread          → ThreadItem[] + meta (active chat window)
 *
 * Conversation identity used to be the serialised
 * `${providerId}:${clientUserId}` key (leaked internal cuids). It is
 * now an opaque 10-char base62 slug allocated lazily by
 * `getOrCreateConversationSlug`. The slug is the public handle in
 * URLs and notification payloads; routes resolve it back to the pair
 * via `resolveConversationSlug` before calling the aggregator.
 */

export type ConversationPartner = {
  /** Identifier as seen by the caller — provider.id for client view,
   * user.id for master view. Avoids leaking internal cuids in places
   * the UI doesn't need them. */
  id: string;
  name: string;
  avatarUrl: string | null;
  /** For master: client phone (visible). For client: master phone if shared. */
  phone: string | null;
  /** Short caption under the name in conversation rows: «Клиент с 2024 · 18 визитов»
   * for master view, «Мастер · маникюр» for client view. */
  roleSummary: string;
  /** Routes for header CTAs. */
  bookingUrl: string | null;
  publicProfileUrl: string | null;
};

export type ConversationListItem = {
  /** Opaque public slug identifying the (provider, client) pair.
   * Stable across all bookings between the same two parties. */
  slug: string;
  partner: ConversationPartner;
  lastMessage: {
    body: string;
    createdAt: string;
    mine: boolean;
  } | null;
  unreadCount: number;
  hasOpenBooking: boolean;
  latestActivityAt: string;
  /** MOBILE-POLISH (App Store 1.2): я заблокировал собеседника. */
  blockedByMe: boolean;
  /** MOBILE-POLISH: собеседник заблокировал меня — переписка закрыта. */
  blockedByOther: boolean;
};

export type ConversationDetail = {
  /** Opaque public slug for the (provider, client) pair. */
  slug: string;
  partner: ConversationPartner;
  thread: ThreadItem[];
  /** Курсор более ранних сообщений («Показать раньше»); null — загружено всё. */
  olderCursor: string | null;
  canSend: boolean;
  openBookingId: string | null;
  readonlyOnly: boolean;
  perspective: ConversationParticipant;
  timezone: string;
};

const PARTNER_PROVIDER_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  publicUsername: true,
  timezone: true,
  ownerUserId: true,
  type: true,
} as const;

const PARTNER_USER_SELECT = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
  phone: true,
  externalPhotoUrl: true,
} as const;

function deriveClientDisplayName(user: {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}): string {
  const dn = user.displayName?.trim();
  if (dn) return dn;
  const combo = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (combo) return combo;
  if (user.phone) return user.phone;
  return "Клиент";
}

function previewBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 80).trimEnd()}…`;
}

/**
 * List all conversations for the caller. Master sees every client
 * they have at least one booking with; client sees every provider.
 */
/**
 * NAV-ATTENTION-01 — сколько сообщений ждёт прочтения у участника переписки.
 * Тот же скоуп и тот же счётчик, что у `listConversations` (брони мастера либо
 * клиента, сообщения ДРУГОЙ стороны без `readAt`, чат только у мастеров), но
 * одним `count` — для точки на вкладке навигации, без выборки карточек.
 */
export async function countUnreadChatMessages(input: {
  userId: string;
  perspective: ConversationParticipant;
}): Promise<number> {
  const { userId, perspective } = input;
  return prisma.chatMessage.count({
    where: {
      readAt: null,
      senderType: perspective === "MASTER" ? ChatSenderType.CLIENT : ChatSenderType.MASTER,
      chat: {
        booking:
          perspective === "MASTER"
            ? { provider: { ownerUserId: userId, type: ProviderType.MASTER } }
            : { clientUserId: userId, provider: { type: ProviderType.MASTER } },
        // 29.09 доработки · 31: считаем ровно те чаты, что видны в списке
        // диалогов (окно активности), — иначе бейдж звал бы к переписке,
        // которой в списке нет.
        messages: { some: { createdAt: { gte: chatConversationsWindowStart() } } },
      },
    },
  });
}

export async function listConversations(input: {
  userId: string;
  perspective: ConversationParticipant;
}): Promise<ConversationListItem[]> {
  const { userId, perspective } = input;

  // Find every chat the caller participates in (any booking, any
  // status). We pull last message + unread count via subqueries to
  // stay in O(1) round-trip space.
  // 29.09 доработки · 31 (решение 31.3): только чаты с движением за последний
  // год — список растёт с каждой записью. Подпись окна — у шапки списка.
  const windowFilter = { messages: { some: { createdAt: { gte: chatConversationsWindowStart() } } } };
  const chats = await prisma.bookingChat.findMany({
    where:
      perspective === "MASTER"
        ? { booking: { provider: { ownerUserId: userId } }, ...windowFilter }
        : { booking: { clientUserId: userId }, ...windowFilter },
    select: {
      id: true,
      createdAt: true,
      booking: {
        select: {
          id: true,
          status: true,
          providerId: true,
          clientUserId: true,
          startAtUtc: true,
          provider: { select: PARTNER_PROVIDER_SELECT },
          clientUser: { select: PARTNER_USER_SELECT },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          body: true,
          createdAt: true,
          senderType: true,
        },
      },
      _count: {
        select: {
          messages: {
            where: {
              readAt: null,
              senderType:
                perspective === "MASTER"
                  ? ChatSenderType.CLIENT
                  : ChatSenderType.MASTER,
            },
          },
        },
      },
    },
  });

  // Group by (providerId, clientUserId) — multiple bookings collapse
  // into a single conversation card.
  type Accumulator = {
    key: ConversationKey;
    /** Собеседник-человек: клиент для мастера, владелец кабинета для клиента. */
    otherUserId: string | null;
    partner: ConversationPartner;
    lastMessage: ConversationListItem["lastMessage"];
    unreadCount: number;
    hasOpenBooking: boolean;
    latestActivityAt: Date;
  };
  const grouped = new Map<string, Accumulator>();

  for (const chat of chats) {
    const booking = chat.booking;
    if (!booking || !booking.clientUserId) continue;
    if (booking.provider?.type !== ProviderType.MASTER) continue; // chat only for master-style providers

    const key: ConversationKey = {
      providerId: booking.providerId,
      clientUserId: booking.clientUserId,
    };
    // Group key — internal only, never leaves the aggregator. We
    // resolve to an opaque public slug in the return mapping below.
    const pairId = `${key.providerId}:${key.clientUserId}`;

    const lastRaw = chat.messages[0];
    const lastMessage = lastRaw
      ? {
          body: previewBody(lastRaw.body),
          createdAt: lastRaw.createdAt.toISOString(),
          mine:
            perspective === "MASTER"
              ? lastRaw.senderType === ChatSenderType.MASTER
              : lastRaw.senderType === ChatSenderType.CLIENT,
        }
      : null;
    const latestActivityAt = lastRaw?.createdAt ?? chat.createdAt;
    const isOpen = isBookingChatOpen(booking);

    const existing = grouped.get(pairId);
    if (!existing) {
      const partner = buildPartner({
        perspective,
        providerSrc: booking.provider,
        clientSrc: booking.clientUser,
        bookingId: booking.id,
      });
      grouped.set(pairId, {
        key,
        otherUserId:
          perspective === "MASTER" ? booking.clientUserId : (booking.provider?.ownerUserId ?? null),
        partner,
        lastMessage,
        unreadCount: chat._count.messages,
        hasOpenBooking: isOpen,
        latestActivityAt,
      });
      continue;
    }

    existing.unreadCount += chat._count.messages;
    existing.hasOpenBooking = existing.hasOpenBooking || isOpen;
    if (latestActivityAt > existing.latestActivityAt) {
      existing.latestActivityAt = latestActivityAt;
      existing.lastMessage = lastMessage;
    }
  }

  const ordered = Array.from(grouped.values()).sort(
    (a, b) => b.latestActivityAt.getTime() - a.latestActivityAt.getTime(),
  );

  // Resolve (or create) the opaque public slug per pair in parallel.
  // Typical caller has ≤ a few dozen conversations — one round-trip
  // each is acceptable; collisions are rare and handled inside
  // `getOrCreateConversationSlug`.
  const [slugs, blocks] = await Promise.all([
    Promise.all(ordered.map((entry) => getOrCreateConversationSlug(entry.key))),
    // MOBILE-POLISH: блоки со всеми собеседниками — одним запросом.
    getChatBlockStates(
      userId,
      ordered.map((entry) => entry.otherUserId),
    ),
  ]);

  return ordered.map((entry, index) => {
    const block = entry.otherUserId ? blocks.get(entry.otherUserId) : undefined;
    return {
      slug: slugs[index]!,
      partner: entry.partner,
      lastMessage: entry.lastMessage,
      unreadCount: entry.unreadCount,
      hasOpenBooking: entry.hasOpenBooking,
      latestActivityAt: entry.latestActivityAt.toISOString(),
      blockedByMe: block?.blockedByMe ?? false,
      blockedByOther: block?.blockedByOther ?? false,
    };
  });
}

type ProviderSrc = {
  id: string;
  name: string;
  avatarUrl: string | null;
  publicUsername: string | null;
  timezone: string;
  ownerUserId: string | null;
  type: ProviderType;
};

type ClientSrc = {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  externalPhotoUrl: string | null;
};

function buildPartner(input: {
  perspective: ConversationParticipant;
  providerSrc: ProviderSrc | null;
  clientSrc: ClientSrc | null;
  bookingId: string | null;
}): ConversationPartner {
  if (input.perspective === "MASTER") {
    const c = input.clientSrc;
    if (!c) {
      return {
        id: "unknown",
        name: "Клиент",
        avatarUrl: null,
        phone: null,
        roleSummary: "Клиент",
        bookingUrl: input.bookingId
          ? `/cabinet/master/bookings?focus=${input.bookingId}`
          : null,
        publicProfileUrl: null,
      };
    }
    return {
      id: c.id,
      name: deriveClientDisplayName(c),
      avatarUrl: c.externalPhotoUrl ?? null,
      phone: c.phone,
      roleSummary: "Клиент",
      bookingUrl: input.bookingId
        ? `/cabinet/master/bookings?focus=${input.bookingId}`
        : null,
      publicProfileUrl: null,
    };
  }
  // perspective === CLIENT
  const p = input.providerSrc;
  if (!p) {
    return {
      id: "unknown",
      name: "Мастер",
      avatarUrl: null,
      phone: null,
      roleSummary: "Мастер",
      bookingUrl: null,
      publicProfileUrl: null,
    };
  }
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl ?? null,
    phone: null, // master phone hidden from public chat view by default
    roleSummary: "Мастер",
    bookingUrl: p.publicUsername ? `/u/${p.publicUsername}` : null,
    publicProfileUrl: p.publicUsername ? `/u/${p.publicUsername}` : null,
  };
}

/** Курсор страницы переписки — время и id самого раннего загруженного сообщения. */
export function encodeThreadCursor(message: { createdAt: Date; id: string }): string {
  return encodeCursor(`${message.createdAt.toISOString()}|${message.id}`);
}

/** Разбор курсора переписки; `null` — токен не разбирается (роут отвечает 400). */
export function decodeThreadCursor(cursor: string): { createdAt: Date; id: string } | null {
  const raw = decodeCursor(cursor);
  if (!raw) return null;
  const sep = raw.indexOf("|");
  if (sep <= 0) return null;
  const createdAt = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

/**
 * Load a single conversation thread — messages across every booking
 * between the (provider, client) pair, flat-ordered, with day separators
 * injected.
 *
 * 29.09 доработки · 31 (решение 31.4): страница — последние
 * `CHAT_THREAD_PAGE_SIZE` сообщений до `before` (по умолчанию — самые
 * свежие); `olderCursor` ведёт к более ранним («Показать раньше»). Раньше
 * грузилась вся история пары с карточкой записи на каждом сообщении.
 * Порядок — `(createdAt, id)`: два сообщения с одним временем не теряются и
 * не дублируются на границе страниц.
 */
export async function getConversationThread(input: {
  key: ConversationKey;
  perspective: ConversationParticipant;
  viewerTimezone: string;
  before?: { createdAt: Date; id: string } | null;
  limit?: number;
}): Promise<ConversationDetail | null> {
  const { key, perspective, viewerTimezone, before } = input;
  const limit = input.limit ?? CHAT_THREAD_PAGE_SIZE;

  const bookings = await prisma.booking.findMany({
    where: {
      providerId: key.providerId,
      clientUserId: key.clientUserId,
    },
    orderBy: { startAtUtc: "desc" },
    select: {
      id: true,
      status: true,
      startAtUtc: true,
      provider: { select: PARTNER_PROVIDER_SELECT },
      clientUser: { select: PARTNER_USER_SELECT },
      chat: { select: { id: true } },
    },
  });

  if (bookings.length === 0) return null;

  const bookingIdByChat = new Map<string, string>();
  for (const booking of bookings) {
    if (booking.chat) bookingIdByChat.set(booking.chat.id, booking.id);
  }

  const rows =
    bookingIdByChat.size === 0
      ? []
      : await prisma.chatMessage.findMany({
          where: {
            chatId: { in: [...bookingIdByChat.keys()] },
            ...(before
              ? {
                  OR: [
                    { createdAt: { lt: before.createdAt } },
                    { createdAt: before.createdAt, id: { lt: before.id } },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit + 1,
          select: {
            id: true,
            chatId: true,
            senderType: true,
            senderName: true,
            body: true,
            readAt: true,
            createdAt: true,
            // CHAT-FOUNDATION-A-MIGRATION: surface attachment id
            // for client renderer (image fetched via media path).
            attachmentMediaAssetId: true,
            referencedBooking: {
              select: {
                id: true,
                status: true,
                startAtUtc: true,
                endAtUtc: true,
                provider: { select: { address: true, timezone: true } },
                masterProvider: { select: { address: true, timezone: true } },
                serviceItems: {
                  select: {
                    titleSnapshot: true,
                    priceSnapshot: true,
                    durationSnapshotMin: true,
                  },
                  take: 1,
                },
                service: {
                  select: { name: true, price: true, durationMin: true },
                },
              },
            },
          },
        });

  const hasOlder = rows.length > limit;
  const page = (hasOlder ? rows.slice(0, limit) : rows).reverse();

  const flat = page.map((message) => {
    const ref = message.referencedBooking;
    const refItem = ref?.serviceItems[0];
    return {
      id: message.id,
      senderType: message.senderType,
      senderName: message.senderName,
      body: message.body,
      readAt: message.readAt,
      createdAt: message.createdAt,
      bookingId: bookingIdByChat.get(message.chatId) ?? "",
      // MASTER-CHAT-ATTACHMENT-FIX-A: emit a signed opaque URL
      // (15-min token in path) instead of the raw asset cuid. The
      // client never sees the prisma id and the route at
      // `/api/chat/attachment/[token]` runs the chat-membership ACL
      // via `ensureCanReadMedia(CHAT_MESSAGE)`.
      attachmentUrl: message.attachmentMediaAssetId
        ? buildChatAttachmentUrl(message.attachmentMediaAssetId)
        : null,
      bookingCard: ref
        ? {
            id: ref.id,
            status: ref.status,
            startAtUtc: ref.startAtUtc?.toISOString() ?? null,
            endAtUtc: ref.endAtUtc?.toISOString() ?? null,
            serviceName: refItem?.titleSnapshot ?? ref.service.name,
            priceSnapshot: refItem?.priceSnapshot ?? ref.service.price,
            durationMin: refItem?.durationSnapshotMin ?? ref.service.durationMin,
            address: ref.masterProvider?.address ?? ref.provider.address ?? null,
            // FIX-TZ-SYSTEM-MESSAGE: salon-tz for the card's appointment
            // time — mirror the address source (masterProvider is where a
            // studio booking physically happens; solo master has no
            // masterProvider so we fall back to the provider). Provider.timezone
            // is non-nullable (schema default Europe/Moscow).
            timezone: ref.masterProvider?.timezone ?? ref.provider.timezone,
          }
        : null,
    };
  });

  const openBooking = bookings.find((b) => isBookingChatOpen(b));
  const partner = buildPartner({
    perspective,
    providerSrc: bookings[0]?.provider ?? null,
    clientSrc: bookings[0]?.clientUser ?? null,
    bookingId: openBooking?.id ?? bookings[0]?.id ?? null,
  });

  const thread = injectDaySeparators(flat, viewerTimezone);
  const slug = await getOrCreateConversationSlug(key);

  return {
    slug,
    partner,
    thread,
    olderCursor: hasOlder && page[0] ? encodeThreadCursor(page[0]) : null,
    canSend: Boolean(openBooking),
    openBookingId: openBooking?.id ?? null,
    readonlyOnly: false, // refined by route via resolveConversationAccess
    perspective,
    timezone: bookings[0]?.provider?.timezone ?? "Europe/Moscow",
  };
}

/**
 * Mark every unread message addressed to the caller (across all
 * bookings in this conversation) as read.
 */
export async function markConversationRead(input: {
  key: ConversationKey;
  perspective: ConversationParticipant;
}): Promise<number> {
  const updated = await prisma.chatMessage.updateMany({
    where: {
      readAt: null,
      senderType:
        input.perspective === "MASTER"
          ? ChatSenderType.CLIENT
          : ChatSenderType.MASTER,
      chat: {
        booking: {
          providerId: input.key.providerId,
          clientUserId: input.key.clientUserId,
        },
      },
    },
    data: { readAt: new Date() },
  });
  return updated.count;
}
