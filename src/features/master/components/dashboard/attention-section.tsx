import { CalendarClock, CalendarX2, Clock, MessageCircle, Star } from "lucide-react";
import {
  AttentionSummary,
  type AttentionSummaryItem,
} from "@/features/cabinet/components/attention-summary";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.attention;

/** Журнал записей, отфильтрованный на «ждут ответа» среди предстоящих. */
const AWAITING_BOOKINGS_HREF = "/cabinet/master/bookings?status=awaiting&upcoming=1";

type Props = {
  /** Новые записи, ждущие подтверждения мастера. */
  pendingConfirmation: number;
  /** Переносы, о которых просит клиент. */
  rescheduleRequests: number;
  /** Непрочитанные сообщения клиентов — то же число, что бейдж «Сообщения». */
  unreadMessages: number;
  /** Отзывы о мастере без ответа — то же число, что бейдж «Отзывы». */
  unansweredReviews: number;
  /** Дата салона `YYYY-MM-DD`, до которой настроено расписание, если оно скоро кончается. */
  scheduleEndsOn: string | null;
};

/**
 * «Требуют внимания» главной кабинета мастера — сгруппированные счётчики
 * (DASHBOARD-REORDER, запрос владельца 2026-10-31). Числа — те же, что бейджи
 * меню кабинета (`master-cabinet-shell.tsx`): записи, ждущие ответа мастера,
 * непрочитанные сообщения, отзывы без ответа; плюс расписание, которое скоро
 * кончится. Свободное время — отдельным списком ниже, это не задача.
 */
export function AttentionSection({
  pendingConfirmation,
  rescheduleRequests,
  unreadMessages,
  unansweredReviews,
  scheduleEndsOn,
}: Props) {
  const items: AttentionSummaryItem[] = [];
  if (pendingConfirmation > 0) {
    items.push({
      id: "pending-confirmation",
      icon: Clock,
      label: T.pendingConfirmation,
      count: pendingConfirmation,
      href: AWAITING_BOOKINGS_HREF,
      urgent: true,
    });
  }
  if (rescheduleRequests > 0) {
    items.push({
      id: "reschedule-requests",
      icon: CalendarClock,
      label: T.rescheduleRequests,
      count: rescheduleRequests,
      href: AWAITING_BOOKINGS_HREF,
      urgent: true,
    });
  }
  if (unreadMessages > 0) {
    items.push({
      id: "unread-messages",
      icon: MessageCircle,
      label: T.unreadMessages,
      count: unreadMessages,
      href: "/cabinet/master/messages",
    });
  }
  if (unansweredReviews > 0) {
    items.push({
      id: "unanswered-reviews",
      icon: Star,
      label: T.unansweredReviews,
      count: unansweredReviews,
      href: "/cabinet/master/reviews?filter=unanswered",
    });
  }
  if (scheduleEndsOn) {
    items.push({
      id: "schedule-ending",
      icon: CalendarX2,
      // Дата-ключ салона — календарная дата без пояса: подпись в UTC полудня.
      label: T.scheduleEnding(UI_FMT.dateShort(`${scheduleEndsOn}T12:00:00.000Z`, { timeZone: "UTC" })),
      count: null,
      href: "/cabinet/master/schedule/settings",
      urgent: true,
    });
  }

  return <AttentionSummary title={T.title} emptyLabel={T.empty} items={items} />;
}
