import {
  BarChart3,
  Bell,
  CalendarClock,
  CalendarDays,
  Home,
  ListChecks,
  Scissors,
  Settings,
  Star,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

export type StudioNavBadgeKey =
  | "scheduleRequestsPending"
  | "reviewsUnanswered"
  | "notificationsUnread";

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
    | "scheduleRequests"
    | "bookings"
    | "masters"
    | "services"
    | "clients"
    | "reviews"
    | "notifications"
    | "analytics"
    | "settings";
  icon: LucideIcon;
  badgeKey?: StudioNavBadgeKey;
};

export type StudioNavGroup = {
  id: string;
  /** UI_TEXT path under `studioCabinet.nav.groups`. */
  labelKey: "studio" | "team" | "clients" | "business" | "studioMeta";
  items: StudioNavItem[];
};

/**
 * Single source of truth for Cabinet Studio navigation. Both the desktop
 * sidebar and the mobile bottom-nav read from this config; UI_TEXT keys
 * resolve to localised labels at render time.
 *
 * 12 nav items in 5 groups. "Rooms" is intentionally excluded (out of
 * scope for current release). Schedule-requests was added in the
 * preceding STUDIO-SCHEDULE-REQUEST-APPROVAL-A commit; this config
 * surfaces it as a first-class nav item with a pending badge.
 */
export const STUDIO_NAV: StudioNavGroup[] = [
  {
    id: "studio",
    labelKey: "studio",
    items: [
      {
        id: "dashboard",
        href: "/cabinet/studio",
        labelKey: "dashboard",
        icon: Home,
        exact: true,
      },
      {
        id: "schedule",
        href: "/cabinet/studio/calendar",
        labelKey: "schedule",
        icon: CalendarDays,
      },
      {
        id: "schedule-requests",
        href: "/cabinet/studio/schedule-requests",
        labelKey: "scheduleRequests",
        icon: CalendarClock,
        badgeKey: "scheduleRequestsPending",
      },
      {
        id: "bookings",
        href: "/cabinet/studio/bookings",
        labelKey: "bookings",
        icon: ListChecks,
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
      {
        id: "services",
        href: "/cabinet/studio/services",
        labelKey: "services",
        icon: Scissors,
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
      {
        id: "notifications",
        href: "/cabinet/studio/notifications",
        labelKey: "notifications",
        icon: Bell,
        badgeKey: "notificationsUnread",
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
    id: "studio-meta",
    labelKey: "studioMeta",
    items: [
      // STUDIO-CLEANUP-FIX-A #9: «Публичная страница» entry removed.
      // It linked to `/cabinet/studio/profile` which was just a
      // `redirect("/cabinet/studio/settings?tab=main")` — sidebar
      // label promised a public profile view but routed to settings,
      // making both the label and the destination misleading. Page
      // file deleted alongside this entry. A real public-page entry
      // (pointing at the studio's external `/u/<publicUsername>`
      // profile) is parked in backlog as a future feature.
      {
        id: "settings",
        href: "/cabinet/studio/settings",
        labelKey: "settings",
        icon: Settings,
      },
    ],
  },
];

export function isStudioNavItemActive(pathname: string, item: StudioNavItem): boolean {
  const match = item.activeMatch ?? item.href;
  if (item.exact) return pathname === match;
  return pathname === match || pathname.startsWith(`${match}/`);
}
