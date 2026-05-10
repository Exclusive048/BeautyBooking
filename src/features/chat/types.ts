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
  key: string;
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

export type ThreadMessageDto = {
  type: "message";
  id: string;
  senderType: "CLIENT" | "MASTER";
  senderName: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  bookingId: string;
};

export type ThreadDaySeparatorDto = {
  type: "day_separator";
  id: string;
  dateKey: string;
};

export type ThreadItemDto = ThreadMessageDto | ThreadDaySeparatorDto;

export type ConversationThreadDto = {
  thread: ThreadItemDto[];
  partner: ConversationPartnerDto;
  perspective: "MASTER" | "CLIENT";
  canSend: boolean;
  openBookingId: string | null;
  readonlyOnly: boolean;
  timezone: string;
};
