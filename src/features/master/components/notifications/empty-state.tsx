import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.notifications;

/**
 * Empty state shown when the active tab/filter has zero results.
 * Offers a link to the personal page so the master always has somewhere
 * to land, even if their master stream is empty for now.
 */
export function NotificationsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle bg-bg-card px-4 py-16 text-center">
      <Bell className="mb-3 h-10 w-10 text-text-sec/40" aria-hidden />
      <p className="font-display text-base text-text-main">{T.emptyTitle}</p>
      <p className="mt-1 max-w-md text-sm text-text-sec">{T.emptyBody}</p>
      <Button asChild variant="ghost" size="sm" className="mt-4 rounded-lg">
        <Link href="/notifications">{T.personalLink}</Link>
      </Button>
    </div>
  );
}
