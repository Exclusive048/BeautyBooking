import { cn } from "@/lib/cn";
import { getCardConfig } from "@/features/master/components/notifications/lib/card-config";
import { readNotificationPayload } from "@/features/master/components/notifications/lib/payload";
import { resolveCurrentWhenLabel } from "@/lib/notifications/current-when";
import * as UI_TEXT from "@/lib/ui/text";
import type { NotificationCenterNotificationItem } from "../lib/types";
import { NotificationActions } from "./notification-actions";
import { UI_FMT } from "@/lib/ui/fmt";

const T = UI_TEXT.studioCabinet.notificationsV2.card;

type Props = {
  item: NotificationCenterNotificationItem;
  /**
   * Пояс студии (salon-tz, rule 17): карточка рендерится на сервере, и без
   * пояса время прихода шло по часам контейнера, а дни групп — по поясу студии.
   */
  timeZone: string;
};

/**
 * Server-rendered notification card. Pulls visual config (icon + tonal
 * left border) from the shared master `card-config` map — covers all
 * booking/review/chat types out of the box. Studio-specific types
 * (STUDIO_*, BILLING_*) fall through to the generic Bell config which
 * looks the same as the rest of the system row, deliberately.
 *
 * "Касается" line surfaces clientName + serviceName from `payloadJson`
 * (per master pattern). No «Кабинет N» — no cabinet model exists.
 */
export function NotificationCard({ item, timeZone }: Props) {
  const config = getCardConfig(item.type);
  const Icon = config.icon;
  const payload = readNotificationPayload(item.payloadJson);
  // RESCHEDULE-CURRENT-TIME: живое время брони, если оно разошлось с текстом.
  const currentWhen = resolveCurrentWhenLabel(payload);
  const timeLabel = UI_FMT.timeShort(item.createdAt, { timeZone });

  const relatesParts: string[] = [];
  if (payload.clientName) relatesParts.push(payload.clientName);
  if (payload.serviceName) relatesParts.push(payload.serviceName);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-card p-4 pl-5",
        !item.isRead && "ring-1 ring-primary/15",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-2 left-1.5 w-1 rounded-full",
          item.isRead ? "bg-transparent" : config.accentBg,
        )}
      />
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
            config.iconBg,
            config.iconColor,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
              {config.label}
            </span>
            <span className="text-[11px] text-text-sec/80">{timeLabel}</span>
            {!item.isRead ? (
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" aria-label={T.unreadAria} />
            ) : null}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold text-text-main">{item.title}</h3>
          {item.body ? (
            <p className="mt-0.5 text-sm text-text-sec">{item.body}</p>
          ) : null}
          {currentWhen ? (
            <p
              className="mt-1 text-xs font-medium text-accent-text"
              data-testid="notification-current-time"
            >
              {UI_TEXT.notificationsCenter.currentTimeLabel}: {currentWhen}
            </p>
          ) : null}
          {relatesParts.length > 0 ? (
            <p className="mt-1 text-[11px] text-text-sec/80">
              <span className="font-mono uppercase tracking-[0.14em]">{T.relatesTo}: </span>
              {relatesParts.join(" · ")}
            </p>
          ) : null}
        </div>
      </header>
      <NotificationActions
        notificationId={item.id}
        type={item.type}
        payloadJson={item.payloadJson}
        openHref={item.openHref}
      />
    </article>
  );
}
