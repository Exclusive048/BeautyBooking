import Link from "next/link";
import {
  AlertCircle,
  Bell,
  Calendar,
  Clock,
  Inbox,
  MessageSquare,
  Settings,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { NotificationTabId } from "./lib/card-config";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.notifications.tabs;

type Tab = {
  id: NotificationTabId;
  label: string;
  icon: LucideIcon;
};

const TABS: Tab[] = [
  { id: "all", label: T.all, icon: Inbox },
  { id: "unread", label: T.unread, icon: Bell },
  { id: "new_booking", label: T.newBooking, icon: Calendar },
  { id: "cancelled", label: T.cancelled, icon: X },
  { id: "rescheduled", label: T.rescheduled, icon: Clock },
  { id: "reminder", label: T.reminder, icon: Bell },
  { id: "review", label: T.review, icon: Star },
  { id: "message", label: T.message, icon: MessageSquare },
  { id: "system", label: T.system, icon: AlertCircle },
];

type Props = {
  activeTab: NotificationTabId;
  tabCounts: Record<NotificationTabId, number>;
  /** Server-computed query string template — pass through current sort. */
  sort: string;
};

/**
 * URL-driven tab bar. Each tab is a plain `<Link>` carrying `?tab=` and
 * the current `?sort=` so toggling tabs preserves sort direction. The
 * active tab is detected on the server (via parent prop) and styled with
 * a primary border-bottom + accented count chip.
 */
export function NotificationsTabs({ activeTab, tabCounts, sort }: Props) {
  // Settings icon kept in the import list for symmetry with future
  // additions; not rendered here.
  void Settings;

  return (
    <nav
      aria-label="Фильтр уведомлений"
      className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8"
    >
      <ul className="flex min-w-max items-center gap-1 border-b border-border-subtle">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          const count = tabCounts[tab.id] ?? 0;
          const params = new URLSearchParams();
          if (tab.id !== "all") params.set("tab", tab.id);
          if (sort && sort !== "newest") params.set("sort", sort);
          const href = params.toString() ? `?${params.toString()}` : "?";
          return (
            <li key={tab.id} className="shrink-0">
              <Link
                href={href}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-primary font-medium text-text-main"
                    : "border-transparent text-text-sec hover:text-text-main"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" aria-hidden />
                <span>{tab.label}</span>
                {count > 0 ? (
                  <span
                    className={cn(
                      "inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                      active
                        ? "bg-primary/10 text-primary"
                        : "bg-bg-input text-text-sec"
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
