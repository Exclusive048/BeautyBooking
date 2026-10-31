import {
  BarChart3,
  Bell,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CreditCard,
  Home,
  MessageSquare,
  ListChecks,
  Scissors,
  Settings,
  SlidersHorizontal,
  Star,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

export type StudioNavBadgeKey =
  | "scheduleRequestsPending"
  | "reviewsUnanswered"
  | "notificationsUnread"
  | "messagesUnread";

export type StudioNavItem = {
  id: string;
  href: string;
  /**
   * Path used for the active-state highlight. Defaults to `href`.
   * Useful when `href` deep-links into a default sub-page.
   */
  activeMatch?: string;
  /** Match only on exact pathname equality (for the root cabinet page). */
  exact?: boolean;
  /** UI_TEXT path under `studioCabinet.nav.items` (single source of truth). */
  labelKey:
    | "dashboard"
    | "schedule"
    | "scheduleSettings"
    | "teamSchedule"
    | "scheduleRequests"
    | "bookings"
    | "masters"
    | "services"
    | "clients"
    | "reviews"
    | "notifications"
    | "messages"
    | "analytics"
    | "settings"
    | "billing";
  icon: LucideIcon;
  badgeKey?: StudioNavBadgeKey;
};

export type StudioNavGroup = {
  id: string;
  /** UI_TEXT path under `studioCabinet.nav.groups`. */
  labelKey: "work" | "team" | "clients" | "business" | "studio";
  items: StudioNavItem[];
};

/**
 * Single source of truth for Cabinet Studio navigation. Both the desktop
 * sidebar and the mobile bottom-nav read from this config; UI_TEXT keys
 * resolve to localised labels at render time.
 *
 * 14 nav items in 5 groups. "Rooms" is intentionally excluded (out of
 * scope for current release).
 *
 * NAV-PARITY-02 (2026-10-16): разделы с тем же названием, что у кабинета
 * мастера (`MasterSidebar`), стоят в той же группе и в том же порядке:
 * «Работа» — Главная, Записи, Уведомления, Расписание, Настройки расписания,
 * Услуги; «Клиенты» — Клиенты, Отзывы; «Бизнес» — Аналитика; последняя
 * группа — настройки, Тариф, затем (в сайдбаре) Моя страница, Публичная
 * страница, Помощь. Своё у студии — группа «Команда».
 */
export const STUDIO_NAV: StudioNavGroup[] = [
  {
    id: "work",
    labelKey: "work",
    items: [
      {
        id: "dashboard",
        href: "/cabinet/studio",
        labelKey: "dashboard",
        icon: Home,
        exact: true,
      },
      {
        id: "bookings",
        href: "/cabinet/studio/bookings",
        labelKey: "bookings",
        icon: ListChecks,
      },
      {
        id: "notifications",
        href: "/cabinet/studio/notifications",
        labelKey: "notifications",
        icon: Bell,
        badgeKey: "notificationsUnread",
      },
      // STUDIO-CHAT: переписка с клиентами от имени студии.
      {
        id: "messages",
        href: "/cabinet/studio/messages",
        labelKey: "messages",
        icon: MessageSquare,
        badgeKey: "messagesUnread",
      },
      {
        id: "schedule",
        href: "/cabinet/studio/calendar",
        labelKey: "schedule",
        icon: CalendarDays,
      },
      // STUDIO-SCHEDULE-SETTINGS-A: per-master picker inside the page.
      {
        id: "schedule-settings",
        href: "/cabinet/studio/schedule/settings",
        labelKey: "scheduleSettings",
        icon: SlidersHorizontal,
      },
      {
        id: "services",
        href: "/cabinet/studio/services",
        labelKey: "services",
        icon: Scissors,
      },
    ],
  },
  {
    id: "team",
    labelKey: "team",
    items: [
      {
        id: "masters",
        href: "/cabinet/studio/team",
        labelKey: "masters",
        icon: Users,
      },
      // SCHEDULE-PATTERNS-01 (этап 4): мастера студии × дни.
      {
        id: "team-schedule",
        href: "/cabinet/studio/schedule/team",
        labelKey: "teamSchedule",
        icon: CalendarRange,
      },
      {
        id: "schedule-requests",
        href: "/cabinet/studio/schedule-requests",
        labelKey: "scheduleRequests",
        icon: CalendarClock,
        badgeKey: "scheduleRequestsPending",
      },
    ],
  },
  {
    id: "clients",
    labelKey: "clients",
    items: [
      {
        id: "clients",
        href: "/cabinet/studio/clients",
        labelKey: "clients",
        icon: UserCircle,
      },
      {
        id: "reviews",
        href: "/cabinet/studio/reviews",
        labelKey: "reviews",
        icon: Star,
        badgeKey: "reviewsUnanswered",
      },
    ],
  },
  {
    id: "business",
    labelKey: "business",
    items: [
      {
        id: "analytics",
        href: "/cabinet/studio/analytics",
        labelKey: "analytics",
        icon: BarChart3,
      },
    ],
  },
  {
    id: "studio",
    labelKey: "studio",
    items: [
      {
        id: "settings",
        href: "/cabinet/studio/settings",
        labelKey: "settings",
        icon: Settings,
      },
      {
        id: "billing",
        href: "/cabinet/studio/billing",
        labelKey: "billing",
        icon: CreditCard,
      },
    ],
  },
];

export function isStudioNavItemActive(pathname: string, item: StudioNavItem): boolean {
  const match = item.activeMatch ?? item.href;
  if (item.exact) return pathname === match;
  return pathname === match || pathname.startsWith(`${match}/`);
}
