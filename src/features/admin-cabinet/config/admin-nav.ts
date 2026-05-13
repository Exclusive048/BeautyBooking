import {
  BookMarked,
  LayoutDashboard,
  MapPin,
  MessageSquareWarning,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

export type AdminNavItemKey =
  | "dashboard"
  | "catalog"
  | "cities"
  | "users"
  | "billing"
  | "reviews"
  | "settings";

export type AdminNavItem = {
  key: AdminNavItemKey;
  href: string;
  label: string;
  /** Shown beside breadcrumbs / under the page title. */
  sublabel: string;
  /** Page heading inside the topbar (`adminPanel.page.<key>.title`). */
  pageTitle: string;
  icon: LucideIcon;
  /** When true, only the exact pathname highlights this item.
   * Otherwise prefix-match (`/admin/users/*`) also highlights it. */
  exact?: boolean;
};

/** Single source of truth for admin navigation. Imported only by client
 * components (`admin-sidebar`, `admin-topbar`) and the breadcrumb resolver
 * which both already live on the client side of the RSC boundary. */
export const ADMIN_NAV: ReadonlyArray<AdminNavItem> = [
  {
    key: "dashboard",
    href: "/admin",
    label: UI_TEXT.adminPanel.nav.dashboard,
    pageTitle: UI_TEXT.adminPanel.page.dashboard.title,
    sublabel: UI_TEXT.adminPanel.page.dashboard.sublabel,
    icon: LayoutDashboard,
    exact: true,
  },
  {
    key: "catalog",
    href: "/admin/catalog",
    label: UI_TEXT.adminPanel.nav.catalog,
    pageTitle: UI_TEXT.adminPanel.page.catalog.title,
    sublabel: UI_TEXT.adminPanel.page.catalog.sublabel,
    icon: BookMarked,
  },
  {
    key: "cities",
    href: "/admin/cities",
    label: UI_TEXT.adminPanel.nav.cities,
    pageTitle: UI_TEXT.adminPanel.page.cities.title,
    sublabel: UI_TEXT.adminPanel.page.cities.sublabel,
    icon: MapPin,
  },
  {
    key: "users",
    href: "/admin/users",
    label: UI_TEXT.adminPanel.nav.users,
    pageTitle: UI_TEXT.adminPanel.page.users.title,
    sublabel: UI_TEXT.adminPanel.page.users.sublabel,
    icon: Users,
  },
  {
    key: "billing",
    href: "/admin/billing",
    label: UI_TEXT.adminPanel.nav.billing,
    pageTitle: UI_TEXT.adminPanel.page.billing.title,
    sublabel: UI_TEXT.adminPanel.page.billing.sublabel,
    icon: Wallet,
  },
  {
    key: "reviews",
    href: "/admin/reviews",
    label: UI_TEXT.adminPanel.nav.reviews,
    pageTitle: UI_TEXT.adminPanel.page.reviews.title,
    sublabel: UI_TEXT.adminPanel.page.reviews.sublabel,
    icon: MessageSquareWarning,
  },
  {
    key: "settings",
    href: "/admin/settings",
    label: UI_TEXT.adminPanel.nav.settings,
    pageTitle: UI_TEXT.adminPanel.page.settings.title,
    sublabel: UI_TEXT.adminPanel.page.settings.sublabel,
    icon: Settings,
  },
];

/** Pathname-based matcher reused by the sidebar and the breadcrumb
 * resolver — keeps "active" and "current crumb" logic in lock-step. */
export function matchAdminNavItem(pathname: string): AdminNavItem | null {
  // Prefer exact /admin match for the dashboard entry; otherwise pick the
  // longest prefix match so /admin/users/123 highlights "Пользователи"
  // instead of falling back to the dashboard root.
  let best: AdminNavItem | null = null;
  for (const item of ADMIN_NAV) {
    if (item.exact) {
      if (pathname === item.href) return item;
      continue;
    }
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}
