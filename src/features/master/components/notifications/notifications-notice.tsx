import Link from "next/link";
import { Info } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.notifications;

/**
 * Static info banner explaining the master/personal split. The link goes
 * to the existing personal notifications page so masters who got
 * disoriented after the 26-NOTIF-A split have a one-click way to find
 * their account events.
 */
export function NotificationsNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-border-subtle bg-bg-page p-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-sec" aria-hidden />
      <p className="text-xs leading-relaxed text-text-sec">
        {T.notice}
        <Link
          href="/notifications"
          className="text-primary underline-offset-2 hover:underline"
        >
          {T.noticeLink}
        </Link>
        .
      </p>
    </div>
  );
}
