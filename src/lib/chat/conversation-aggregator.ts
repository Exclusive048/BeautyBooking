import { ChatSenderType, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPEN_STATUSES } from "@/lib/chat/status";
import {
  serializeConversationKey,
  type ConversationKey,
} from "@/lib/chat/conversation-key";
import {
  injectDaySeparators,
  type ThreadItem,
} from "@/lib/chat/thread-grouping";
import type { ConversationParticipant } from "@/lib/chat/conversation-access";

/**
 * Per-pair conversation aggregator (33a).
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
 * Conversation identity = `${providerId}:${clientUserId}` — see
 * `conversation-key.ts`.
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
  key: string;
  partner: ConversationPartner;
  lastMessage: {
    body: string;
    createdAt: string;
    mine: boolean;
  } | null;
  unreadCount: number;
  hasOpenBooking: boolean;
  latestActivityAt: string;
};

export type ConversationDetail = {
  key: string;
  partner: ConversationPartner;
  thread: ThreadItem[];
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
export async function listConversations(input: {
  userId: string;
  perspective: ConversationParticipant;
}): Promise<ConversationListItem[]> {
  const { userId, perspective } = input;

  // Find every chat the caller participates in (any booking, any
  // status). We pull last message + unread count via subqueries to
  // stay in O(1) round-trip space.
  const chats = await prisma.bookingChat.findMany({
    where:
      perspective === "MASTER"
        ? { booking: { provider: { ownerUserId: userId } } }
        : { booking: { clientUserId: userId } },
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
    const keySerialized = serializeConversationKey(key);

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
    const isOpen = OPEN_STATUSES.includes(booking.status);

    const existing = grouped.get(keySerialized);
    if (!existing) {
      const partner = buildPartner({
        perspective,
        providerSrc: booking.provider,
        clientSrc: booking.clientUser,
        bookingId: booking.id,
      });
      grouped.set(keySerialized, {
        key,
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

  return Array.from(grouped.values())
    .sort((a, b) => b.latestActivityAt.getTime() - a.latestActivityAt.getTime())
    .map((entry) => ({
      key: serializeConversationKey(entry.key),
      partner: entry.partner,
      lastMessage: entry.lastMessage,
      unreadCount: entry.unreadCount,
      hasOpenBooking: entry.hasOpenBooking,
      latestActivityAt: entry.latestActivityAt.toISOString(),
    }));
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
          ? `/cabinet/master/bookings?bookingId=${input.bookingId}`
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
        ? `/cabinet/master/bookings?bookingId=${input.bookingId}`
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

/**
 * Load a single conversation thread — all messages across every
 * booking between the (provider, client) pair, flat-ordered, with
 * day separators injected.
 */
export async function getConversationThread(input: {
  key: ConversationKey;
  perspective: ConversationParticipant;
  viewerTimezone: string;
}): Promise<ConversationDetail | null> {
  const { key, perspective, viewerTimezone } = input;

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
      chat: {
        select: {
          id: true,
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              senderType: true,
              senderName: true,
              body: true,
              readAt: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (bookings.length === 0) return null;

  // Aggregate all messages across all bookings, attach bookingId,
  // and sort globally.
  const flat = bookings.flatMap((booking) => {
    const chat = booking.chat;
    if (!chat) return [];
    return chat.messages.map((message) => ({
      id: message.id,
      senderType: message.senderType,
      senderName: message.senderName,
      body: message.body,
      readAt: message.readAt,
      createdAt: message.createdAt,
      bookingId: booking.id,
    }));
  });
  flat.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const openBooking = bookings.find((b) => OPEN_STATUSES.includes(b.status));
  const partner = buildPartner({
    perspective,
    providerSrc: bookings[0]?.provider ?? null,
    clientSrc: bookings[0]?.clientUser ?? null,
    bookingId: openBooking?.id ?? bookings[0]?.id ?? null,
  });

  const thread = injectDaySeparators(flat, viewerTimezone);

  return {
    key: serializeConversationKey(key),
    partner,
    thread,
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
