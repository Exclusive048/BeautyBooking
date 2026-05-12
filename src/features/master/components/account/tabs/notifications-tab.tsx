import { ChannelsCard } from "../notifications/channels-card";
import { PerEventPlaceholder } from "../notifications/per-event-placeholder";

/** Notifications tab — channel-level toggles + per-event placeholder. */
export function NotificationsTab() {
  return (
    <div className="space-y-4">
      <ChannelsCard />
      <PerEventPlaceholder />
    </div>
  );
}
