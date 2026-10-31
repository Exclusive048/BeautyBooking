import { CalendarClock, Clock, MessageCircle, Star } from "lucide-react";
import { AttentionSummary, type AttentionSummaryItem } from "@/features/cabinet/components/attention-summary";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioAttentionItem } from "../server/types";

const T = UI_TEXT.studioCabinet.dashboardV2.attention;

type Props = {
  /** Пункты сервиса (`buildAttentionItems`) — только те, где что-то ждёт. */
  items: StudioAttentionItem[];
  /** Непрочитанные сообщения клиентов в переписке студии (STUDIO-CHAT). */
  unreadMessages: number;
};

/**
 * «Требуют внимания» главной студии (DASHBOARD-REORDER): записи, ждущие
 * подтверждения студии, новые сообщения клиентов, отзывы без ответа и заявки
 * мастеров на график — числами, без деталей; строка ведёт туда, где это
 * разбирают.
 */
export function StudioAttentionSection({ items, unreadMessages }: Props) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const rows: AttentionSummaryItem[] = [];

  const bookings = byId.get("bookings-awaiting");
  if (bookings) {
    rows.push({
      id: bookings.id,
      icon: Clock,
      label: T.bookingsAwaiting,
      count: bookings.count,
      href: bookings.href,
      urgent: true,
    });
  }
  if (unreadMessages > 0) {
    rows.push({
      id: "messages-unread",
      icon: MessageCircle,
      label: T.unreadMessages,
      count: unreadMessages,
      href: "/cabinet/studio/messages",
    });
  }
  const reviews = byId.get("reviews-unanswered");
  if (reviews) {
    rows.push({ id: reviews.id, icon: Star, label: T.reviewsUnanswered, count: reviews.count, href: reviews.href });
  }
  const requests = byId.get("schedule-requests");
  if (requests) {
    rows.push({
      id: requests.id,
      icon: CalendarClock,
      label: T.scheduleRequests,
      count: requests.count,
      href: requests.href,
      urgent: true,
    });
  }

  return <AttentionSummary title={T.title} emptyLabel={T.empty} items={rows} />;
}
