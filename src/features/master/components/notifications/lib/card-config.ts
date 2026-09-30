import { NotificationType } from "@prisma/client";
import * as UI_TEXT from "@/lib/ui/text";
import {
  AlertCircle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  FolderCheck,
  FolderX,
  Image as ImageIcon,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  UserCheck,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Per-type visual config for `<NotificationCard>`. Covers the 22
 * notification types that can land in the master surface (see
 * `MASTER_NOTIFICATION_TYPES` in `lib/notifications/groups.ts`).
 *
 * Tailwind classes are picked from the project's tonal palette (rose for
 * urgent, amber for attention, emerald for positive, blue for reminders,
 * slate for neutral). The `accentBg` is used as the 4-px left border on
 * unread cards; the iconBg/iconColor pair styles the small badge.
 */
export type CardConfig = {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  accentBg: string;
  label: string;
};

const FALLBACK_CONFIG: CardConfig = {
  icon: Bell,
  iconBg: "bg-bg-input",
  iconColor: "text-text-sec",
  accentBg: "bg-text-sec",
  label: "Уведомление",
};

// 29.09 · 23: «новая запись» — акцент бренда, а не ошибка (rose был цветом
// «активного», таблица статусов скилла); неявка делит тот же вид.
const ROSE_URGENT: Pick<CardConfig, "iconBg" | "iconColor" | "accentBg"> = {
  iconBg: "bg-primary/10",
  iconColor: "text-accent-text",
  accentBg: "bg-primary",
};

// Отмена и отклонение — красный статус (решение владельца 23.1).
const ROSE_SOFT: Pick<CardConfig, "iconBg" | "iconColor" | "accentBg"> = {
  iconBg: "bg-danger-surface",
  iconColor: "text-danger-text",
  accentBg: "bg-destructive/70",
};

const AMBER: Pick<CardConfig, "iconBg" | "iconColor" | "accentBg"> = {
  iconBg: "bg-warning-surface",
  iconColor: "text-warning-text",
  accentBg: "bg-warning",
};

const AMBER_SOFT: Pick<CardConfig, "iconBg" | "iconColor" | "accentBg"> = {
  iconBg: "bg-warning-surface",
  iconColor: "text-warning-text",
  accentBg: "bg-warning",
};

const BLUE: Pick<CardConfig, "iconBg" | "iconColor" | "accentBg"> = {
  iconBg: "bg-info-surface",
  iconColor: "text-info-text",
  accentBg: "bg-info",
};

const EMERALD: Pick<CardConfig, "iconBg" | "iconColor" | "accentBg"> = {
  iconBg: "bg-success-surface",
  iconColor: "text-success-text",
  accentBg: "bg-success",
};

const SLATE: Pick<CardConfig, "iconBg" | "iconColor" | "accentBg"> = {
  iconBg: "bg-muted",
  iconColor: "text-muted-foreground",
  accentBg: "bg-muted-foreground/60",
};

const CONFIG_MAP: Partial<Record<NotificationType, CardConfig>> = {
  [NotificationType.BOOKING_REQUEST]: { icon: Calendar, ...ROSE_URGENT, label: "Новая запись" },
  [NotificationType.BOOKING_CREATED]: { icon: Calendar, ...ROSE_URGENT, label: "Новая запись" },
  [NotificationType.BOOKING_CANCELLED_BY_CLIENT]: { icon: X, ...ROSE_SOFT, label: "Отмена клиентом" },
  [NotificationType.BOOKING_CANCELLED]: { icon: X, ...ROSE_SOFT, label: "Запись отменена" },
  [NotificationType.BOOKING_RESCHEDULED]: { icon: Clock, ...AMBER_SOFT, label: "Перенос записи" },
  [NotificationType.BOOKING_RESCHEDULE_REQUESTED]: { icon: Clock, ...AMBER, label: "Запрос переноса" },
  [NotificationType.BOOKING_REMINDER_24H]: { icon: Bell, ...BLUE, label: "Напоминание" },
  [NotificationType.BOOKING_REMINDER_2H]: { icon: Bell, ...BLUE, label: "Скоро запись" },
  [NotificationType.BOOKING_COMPLETED_REVIEW]: { icon: CheckCircle2, ...EMERALD, label: "Запись завершена" },
  [NotificationType.BOOKING_NO_SHOW]: { icon: AlertCircle, ...ROSE_URGENT, label: "Клиент не пришёл" },
  [NotificationType.REVIEW_LEFT]: { icon: Star, ...AMBER, label: "Новый отзыв" },
  [NotificationType.REVIEW_REPLIED]: { icon: MessageSquare, ...EMERALD, label: "Ответ на отзыв" },
  [NotificationType.CHAT_MESSAGE_RECEIVED]: { icon: MessageSquare, ...SLATE, label: "Сообщение" },
  [NotificationType.MODEL_NEW_APPLICATION]: { icon: ImageIcon, ...AMBER, label: "Заявка модели" },
  [NotificationType.MODEL_APPLICATION_RECEIVED]: { icon: ImageIcon, ...AMBER, label: "Заявка модели" },
  [NotificationType.MODEL_BOOKING_CREATED]: { icon: UserCheck, ...EMERALD, label: "Модель записалась" },
  [NotificationType.MODEL_TIME_CONFIRMED]: { icon: UserCheck, ...EMERALD, label: "Время подтверждено" },
  [NotificationType.HOT_SLOT_PUBLISHED]: { icon: Zap, ...AMBER, label: "Горящее окошко" },
  [NotificationType.HOT_SLOT_BOOKED]: { icon: Sparkles, ...EMERALD, label: "Окошко заняли" },
  [NotificationType.HOT_SLOT_EXPIRING]: { icon: Zap, ...AMBER, label: "Окошко скоро сгорит" },
  [NotificationType.MASTER_WEEKLY_STATS]: { icon: TrendingUp, ...SLATE, label: "Сводка недели" },
  [NotificationType.SCHEDULE_ENDING]: {
    icon: Calendar,
    ...AMBER,
    label: UI_TEXT.cabinetMaster.scheduleSettings.plan.endingNotificationLabel,
  },
  [NotificationType.CATEGORY_APPROVED]: { icon: FolderCheck, ...EMERALD, label: "Категория принята" },
  [NotificationType.CATEGORY_REJECTED]: { icon: FolderX, ...ROSE_SOFT, label: "Категория отклонена" },
};

export function getCardConfig(type: NotificationType | "SCHEDULE_REQUEST"): CardConfig {
  if (type === "SCHEDULE_REQUEST") {
    return { icon: ShieldCheck, ...SLATE, label: "Запрос графика" };
  }
  return CONFIG_MAP[type] ?? FALLBACK_CONFIG;
}

/**
 * Stable tab bucket id derived from notification type. Used both for
 * server-side count aggregation and client-side filtering. Order matches
 * the visual order in `<NotificationsTabs>`.
 */
export type NotificationTabId =
  | "all"
  | "unread"
  | "new_booking"
  | "cancelled"
  | "rescheduled"
  | "reminder"
  | "review"
  | "message"
  | "system";

export function classifyTabBucket(
  type: NotificationType | "SCHEDULE_REQUEST"
): Exclude<NotificationTabId, "all" | "unread"> {
  switch (type) {
    case NotificationType.BOOKING_REQUEST:
    case NotificationType.BOOKING_CREATED:
    case NotificationType.MODEL_NEW_APPLICATION:
    case NotificationType.MODEL_APPLICATION_RECEIVED:
    case NotificationType.MODEL_BOOKING_CREATED:
      return "new_booking";
    case NotificationType.BOOKING_CANCELLED_BY_CLIENT:
    case NotificationType.BOOKING_CANCELLED:
    case NotificationType.BOOKING_NO_SHOW:
      return "cancelled";
    case NotificationType.BOOKING_RESCHEDULED:
    case NotificationType.BOOKING_RESCHEDULE_REQUESTED:
    case NotificationType.MODEL_TIME_CONFIRMED:
      return "rescheduled";
    case NotificationType.BOOKING_REMINDER_24H:
    case NotificationType.BOOKING_REMINDER_2H:
    case NotificationType.HOT_SLOT_EXPIRING:
      return "reminder";
    case NotificationType.REVIEW_LEFT:
    case NotificationType.REVIEW_REPLIED:
    case NotificationType.BOOKING_COMPLETED_REVIEW:
      return "review";
    case NotificationType.CHAT_MESSAGE_RECEIVED:
      return "message";
    default:
      return "system";
  }
}

// Icons exported for the tabs bar — keeps the type-by-type config in
// one module so tab definitions don't duplicate icon imports.
export const TabIcons = {
  Users,
  Calendar,
  Clock,
  Bell,
  Star,
  MessageSquare,
  AlertCircle,
};
