/** Client-side DTOs mirroring `src/lib/chat/conversation-aggregator.ts`. */

export type ChatPerspective = "master" | "client";

export type ConversationPartnerDto = {
  id: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  roleSummary: string;
  bookingUrl: string | null;
  publicProfileUrl: string | null;
};

export type ConversationListItemDto = {
  /** Opaque public slug for the (provider, client) pair —
   * chat-url-fix renamed `key` → `slug` so URLs no longer leak
   * internal cuids. */
  slug: string;
  partner: ConversationPartnerDto;
  lastMessage: {
    body: string;
    createdAt: string;
    mine: boolean;
  } | null;
  unreadCount: number;
  hasOpenBooking: boolean;
  latestActivityAt: string;
};

/** Booking snapshot pinned by a SYSTEM message. */
export type ThreadBookingCardDto = {
  id: string;
  status: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  serviceName: string;
  priceSnapshot: number;
  durationMin: number;
  address: string | null;
};

export type ThreadMessageDto = {
  type: "message";
  id: string;
  /** SYSTEM is a centered notification, rendered without a sided bubble. */
  senderType: "CLIENT" | "MASTER" | "SYSTEM";
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  bookingId: string;
  /** Card rendered alongside a SYSTEM message. Null for plain text. */
  bookingCard: ThreadBookingCardDto | null;
  /**
   * Server-built signed URL for the image attachment, or `null` when
   * the message has no image. MASTER-CHAT-ATTACHMENT-FIX-A: replaced
   * the raw `attachmentMediaAssetId` (cuid) with a token-only opaque
   * URL — no prisma cuid in URL bar (per user requirement «никаких ID
   * в запросе»). The route `/api/chat/attachment/[token]` runs the
   * chat-membership ACL (admits only the two chat participants;
   * studio admins denied, outsiders 403).
   */
  attachmentUrl: string | null;
};

export type ThreadDaySeparatorDto = {
  type: "day_separator";
  id: string;
  dateKey: string;
};

export type ThreadItemDto = ThreadMessageDto | ThreadDaySeparatorDto;

export type ConversationThreadDto = {
  /** Opaque public slug echoed back from the API for symmetry. */
  slug: string;
  thread: ThreadItemDto[];
  partner: ConversationPartnerDto;
  perspective: "MASTER" | "CLIENT";
  canSend: boolean;
  openBookingId: string | null;
  readonlyOnly: boolean;
  timezone: string;
};
