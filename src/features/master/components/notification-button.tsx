import Link from "next/link";
import { Bell } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  /** Total unread badge — see `getUnreadBadgeCount`. Hidden when 0. */
  count: number;
  href?: string;
};

const T = UI_TEXT.cabinetMaster.pageHeader;

/**
 * Bell icon + count badge linking to the notifications inbox. Lives in
 * page-header `actions` so each page can decide whether to surface it.
 * The pure-link form keeps it server-renderable; no client interactivity
 * needed.
 */
export function NotificationButton({ count, href = "/cabinet/master/notifications" }: Props) {
  const showBadge = count > 0;
  return (
    <Link
      href={href}
      aria-label={T.notificationsAria}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle bg-bg-card text-text-sec transition-colors hover:bg-bg-input/70 hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Bell className="h-4 w-4" aria-hidden />
      {showBadge ? (
        <span
          aria-label={`${count}`}
          className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[9px] font-medium text-white tabular-nums"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
