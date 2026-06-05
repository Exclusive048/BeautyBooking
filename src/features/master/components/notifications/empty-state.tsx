import { Bell } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.notifications;

/**
 * Empty state shown when the active tab/filter has zero results.
 * Offers a link to the personal page so the master always has somewhere
 * to land, even if their master stream is empty for now.
 */
export function NotificationsEmptyState() {
  return (
    <EmptyState
      variant="card"
      icon={Bell}
      title={T.emptyTitle}
      description={T.emptyBody}
      action={{
        label: T.personalLink,
        href: "/notifications",
        variant: "ghost",
        size: "sm",
      }}
    />
  );
}
