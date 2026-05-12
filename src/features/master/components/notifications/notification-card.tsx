import { cn } from "@/lib/cn";
import type { NotificationCenterNotificationItem } from "@/lib/notifications/center";
import { getCardConfig } from "./lib/card-config";
import { formatTimeAgo } from "./lib/format-time-ago";
import { readNotificationPayload } from "./lib/payload";
import { MarkReadButton } from "./mark-read-button";
import { NotificationActions } from "./notification-actions";

type Props = {
  notification: NotificationCenterNotificationItem;
  /** Reference time used by the time-ago label, server-stable. */
  now: Date;
};

/**
 * Single notification row. Composed entirely on the server — only the
 * action buttons (`<NotificationActions>`) and read toggle
 * (`<MarkReadButton>`) hydrate as client islands. The unread state gets a
 * 4-px primary-tinted left bar plus a slightly tinted background so a
 * cluster of unread items reads as one block at a glance.
 */
export function NotificationCard({ notification, now }: Props) {
  const isUnread = !notification.isRead;
  const config = getCardConfig(notification.type);
  const payload = readNotificationPayload(notification.payloadJson);
  const Icon = config.icon;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-bg-card p-4 transition-colors",
        isUnread ? "border-primary/30 bg-primary/5" : "border-border-subtle"
      )}
    >
      {isUnread ? (
        <span
          aria-hidden
          className={cn("absolute inset-y-0 left-0 w-1", config.accentBg)}
        />
      ) : null}

      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            config.iconBg
          )}
          aria-hidden
        >
          <Icon className={cn("h-4 w-4", config.iconColor)} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
                {config.label}
              </p>
              {isUnread ? (
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
              ) : null}
            </div>
            <p className="shrink-0 text-xs text-text-sec">
              {formatTimeAgo(notification.createdAt, now)}
            </p>
          </div>

          <p className="mt-1 text-sm font-medium text-text-main">{notification.title}</p>
          {notification.body ? (
            <p className="mt-1 line-clamp-3 text-sm text-text-sec">{notification.body}</p>
          ) : null}

          <NotificationActions
            notificationId={notification.id}
            type={notification.type}
            payload={payload}
          />
        </div>

        <MarkReadButton notificationId={notification.id} isUnread={isUnread} />
      </div>
    </article>
  );
}
