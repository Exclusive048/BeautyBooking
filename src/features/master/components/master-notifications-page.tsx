"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type InviteCardItem = {
  id: string;
  studio: {
    id: string;
    provider: {
      name: string;
      tagline: string | null;
      avatarUrl: string | null;
      ratingAvg: number;
      address: string;
      district: string;
    };
  };
};

type TimelineNotificationItem = {
  id: string;
  title: string;
  body: string | null;
  type: "BOOKING_CREATED" | "BOOKING_CANCELLED" | "BOOKING_RESCHEDULED";
  readAt: string | null;
  createdAt: string;
};

type TimelineFilter = "all" | "bookings" | "system";
type UiNotificationKind = "booking_created" | "booking_cancelled" | "booking_rescheduled" | "system";

type Props = {
  invites: InviteCardItem[];
  notifications: TimelineNotificationItem[];
  unreadCount: number;
  hasPhone: boolean;
};

export function MasterNotificationsPage({
  invites,
  notifications,
  unreadCount,
  hasPhone,
}: Props) {
  // Hot-window business action is not implemented in current domain layer yet.
  const canPublishHotWindow = false;
  const [items, setItems] = useState<InviteCardItem[]>(invites);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mapNotificationKind = (type: TimelineNotificationItem["type"]): UiNotificationKind => {
    if (type === "BOOKING_CREATED") return "booking_created";
    if (type === "BOOKING_CANCELLED") return "booking_cancelled";
    if (type === "BOOKING_RESCHEDULED") return "booking_rescheduled";
    return "system";
  };

  const mappedNotifications = useMemo(
    () =>
      notifications.map((note) => ({
        ...note,
        uiKind: mapNotificationKind(note.type),
      })),
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    if (timelineFilter === "all") return mappedNotifications;
    if (timelineFilter === "bookings") {
      return mappedNotifications.filter((note) => note.uiKind !== "system");
    }
    return mappedNotifications.filter((note) => note.uiKind === "system");
  }, [mappedNotifications, timelineFilter]);

  const platformNewsItems = useMemo(
    () => mappedNotifications.filter((note) => note.uiKind === "system").slice(0, 8),
    [mappedNotifications]
  );

  const iconToneClass = (kind: UiNotificationKind): string => {
    if (kind === "booking_created") return "bg-green-500/20 text-green-300";
    if (kind === "booking_cancelled") return "bg-red-500/20 text-red-300";
    if (kind === "booking_rescheduled") return "bg-blue-500/20 text-blue-300";
    return "bg-blue-500/20 text-blue-300";
  };

  const kindLabel = (kind: UiNotificationKind): string => {
    if (kind === "booking_created") return UI_TEXT.master.notifications.bookingCreatedLabel;
    if (kind === "booking_cancelled") return UI_TEXT.master.notifications.bookingCancelledLabel;
    if (kind === "booking_rescheduled") return UI_TEXT.master.notifications.bookingRescheduledLabel;
    return UI_TEXT.master.notifications.systemLabel;
  };

  const postInviteAction = async (url: string, inviteId: string) => {
    setSavingId(inviteId);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<{ inviteId: string }> | null;
      if (!response.ok || !json || !json.ok) {
        const message = json && !json.ok ? json.error.message : UI_TEXT.master.notifications.actionFailed;
        setError(message);
        return;
      }
      setItems((prev) => prev.filter((invite) => invite.id !== inviteId));
    } catch {
      setError(UI_TEXT.master.notifications.networkError);
    } finally {
      setSavingId(null);
    }
  };

  const onPublishHotWindow = () => {
    setError(UI_TEXT.master.notifications.hotWindowUnavailable);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-neutral-900 p-5 text-neutral-100 shadow-sm">
        <h1 className="text-xl font-semibold">{UI_TEXT.master.notifications.title}</h1>
        <p className="mt-1 text-sm text-neutral-300">{UI_TEXT.master.notifications.subtitle}</p>
      </section>

      <section className="rounded-xl bg-neutral-900 p-5 text-neutral-100 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{UI_TEXT.master.invites.pinnedTitle}</h2>
          {unreadCount > 0 ? (
            <form action="/api/notifications/read-all" method="POST">
              <button
                type="submit"
                className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900"
              >
                {UI_TEXT.master.notifications.markAllRead}
              </button>
            </form>
          ) : null}
        </div>

        {!hasPhone ? (
          <div className="rounded-lg bg-neutral-800 p-4 text-sm text-neutral-300">
            {UI_TEXT.master.invites.phoneRequired}
          </div>
        ) : null}

        {hasPhone && items.length === 0 ? (
          <div className="rounded-lg bg-neutral-800 p-4">
            <div className="text-sm font-medium">{UI_TEXT.master.invites.emptyTitle}</div>
            <div className="mt-1 text-sm text-neutral-300">{UI_TEXT.master.invites.emptyDesc}</div>
            <Link
              href="/cabinet/master/profile"
              className="mt-3 inline-flex rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900"
            >
              {UI_TEXT.master.invites.fillProfile}
            </Link>
          </div>
        ) : null}

        {hasPhone && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((invite) => (
              <article key={invite.id} className="rounded-lg bg-neutral-800 p-4">
                <div className="flex items-start gap-3">
                  {invite.studio.provider.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={invite.studio.provider.avatarUrl}
                      alt={invite.studio.provider.name}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-neutral-700" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold">
                      {UI_FMT.inviteTitle(invite.studio.provider.name)}
                    </div>
                    {invite.studio.provider.tagline ? (
                      <div className="mt-0.5 text-sm text-neutral-300">{invite.studio.provider.tagline}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-neutral-400">
                      ⭐ {invite.studio.provider.ratingAvg.toFixed(1)} · {invite.studio.provider.district}
                    </div>
                    <div className="mt-1 text-xs text-neutral-400">{invite.studio.provider.address}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void postInviteAction(`/api/invites/${invite.id}/accept`, invite.id)}
                    disabled={savingId === invite.id}
                    className="rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {savingId === invite.id ? UI_TEXT.master.notifications.accepting : UI_TEXT.master.notifications.accept}
                  </button>
                  <button
                    type="button"
                    onClick={() => void postInviteAction(`/api/invites/${invite.id}/reject`, invite.id)}
                    disabled={savingId === invite.id}
                    className="rounded-lg bg-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100 disabled:opacity-60"
                  >
                    {savingId === invite.id ? UI_TEXT.master.notifications.declining : UI_TEXT.master.notifications.decline}
                  </button>
                  <Link
                    href={`/studios/${invite.studio.id}`}
                    className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900"
                  >
                    {UI_TEXT.master.notifications.viewStudioProfile}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {error ? <div className="mt-3 rounded-lg bg-red-900/30 p-3 text-sm text-red-200">{error}</div> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl bg-neutral-900 p-5 text-neutral-100 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{UI_TEXT.master.notifications.timelineTitle}</h2>
            <div className="inline-flex rounded-lg bg-neutral-800 p-1">
              <button
                type="button"
                onClick={() => setTimelineFilter("all")}
                className={
                  timelineFilter === "all"
                    ? "rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-900"
                    : "rounded-md px-3 py-1 text-xs text-neutral-300"
                }
              >
                {UI_TEXT.master.notifications.filterAll}
              </button>
              <button
                type="button"
                onClick={() => setTimelineFilter("bookings")}
                className={
                  timelineFilter === "bookings"
                    ? "rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-900"
                    : "rounded-md px-3 py-1 text-xs text-neutral-300"
                }
              >
                {UI_TEXT.master.notifications.filterBookings}
              </button>
              <button
                type="button"
                onClick={() => setTimelineFilter("system")}
                className={
                  timelineFilter === "system"
                    ? "rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-900"
                    : "rounded-md px-3 py-1 text-xs text-neutral-300"
                }
              >
                {UI_TEXT.master.notifications.filterSystem}
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {filteredNotifications.slice(0, 30).map((note) => (
              <div key={note.id} className="rounded-lg bg-neutral-800 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${iconToneClass(note.uiKind)}`}>
                      ●
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{note.title}</div>
                      <div className="mt-0.5 text-[11px] text-neutral-400">{kindLabel(note.uiKind)}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-neutral-400">{UI_FMT.notificationTimeLabel(note.createdAt)}</div>
                </div>
                {note.body ? <div className="mt-2 text-xs text-neutral-300">{note.body}</div> : null}
                {note.uiKind === "booking_cancelled" ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={onPublishHotWindow}
                      disabled={!canPublishHotWindow}
                      className="rounded-lg bg-orange-500/20 px-3 py-2 text-xs font-medium text-orange-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {UI_TEXT.master.notifications.publishHotWindow}
                    </button>
                  </div>
                ) : null}
                {!note.readAt ? (
                  <div className="mt-2 text-[11px] text-blue-300">{UI_TEXT.master.notifications.newBadge}</div>
                ) : null}
              </div>
            ))}
          </div>
          {filteredNotifications.length === 0 ? (
            <div className="mt-3 text-sm text-neutral-300">{UI_TEXT.master.notifications.timelineSoon}</div>
          ) : null}
        </div>

        <aside className="rounded-xl bg-neutral-900 p-5 text-neutral-100 shadow-sm">
          <h2 className="text-base font-semibold">{UI_TEXT.master.platform.title}</h2>
          {platformNewsItems.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-300">{UI_TEXT.master.platform.soon}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {platformNewsItems.map((note) => (
                <article key={note.id} className="rounded-lg bg-neutral-800 p-3">
                  <div className="text-xs text-blue-300">{UI_TEXT.master.notifications.systemLabel}</div>
                  <div className="mt-1 text-sm font-medium">{note.title}</div>
                  {note.body ? <div className="mt-1 text-xs text-neutral-300">{note.body}</div> : null}
                  <div className="mt-2 text-[11px] text-neutral-400">{UI_FMT.notificationTimeLabel(note.createdAt)}</div>
                </article>
              ))}
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
