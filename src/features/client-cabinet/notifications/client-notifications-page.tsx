"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Bell,
  Calendar,
  Clock,
  Star,
  Sparkles,
  Settings,
  CheckCheck,
  Inbox,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  groupForNotificationType,
  type ClientNotificationGroup,
} from "@/lib/client-cabinet/notification-groups";
import { UI_TEXT } from "@/lib/ui/text";
import type { NotificationType } from "@prisma/client";

const T = UI_TEXT.clientCabinet.notifications;

type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
  payloadJson?: Record<string, unknown> | null;
};

function extractBookingId(payload: NotificationItem["payloadJson"]): string | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as Record<string, unknown>).bookingId;
  return typeof raw === "string" ? raw : null;
}

function extractLink(payload: NotificationItem["payloadJson"]): string | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as Record<string, unknown>).link;
  return typeof raw === "string" ? raw : null;
}

type Payload = {
  notifications: NotificationItem[];
  nextCursor: string | null;
};

type Filter = "all" | ClientNotificationGroup;

const FILTER_OPTIONS: Array<{ value: Filter; label: string; icon: typeof Bell }> = [
  { value: "all", label: T.filterAll, icon: Bell },
  { value: "bookings", label: T.filterBookings, icon: Calendar },
  { value: "reminders", label: T.filterReminders, icon: Clock },
  { value: "reviews", label: T.filterReviews, icon: Star },
  { value: "promo", label: T.filterPromo, icon: Sparkles },
  { value: "system", label: T.filterSystem, icon: Settings },
];

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(async (res) => {
    const json = await res.json();
    if (!json.ok) throw new Error(json.error?.message ?? "load_failed");
    return json.data as Payload;
  });

export function ClientNotificationsPage() {
  // 30s auto-poll + revalidate on focus keeps the surface fresh without
  // requiring an SSE subscription on this page. Visibility gate (built
  // into SWR's `refreshWhenHidden=false`) prevents background tabs from
  // hammering the API.
  const { data, mutate, isLoading, error } = useSWR<Payload>(
    "/api/notifications?context=personal&limit=50",
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      refreshWhenHidden: false,
    },
  );

  const [filter, setFilter] = useState<Filter>("all");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const autoMarkedRef = useRef(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.notifications.filter((n) => {
      if (onlyUnread && n.isRead) return false;
      if (filter === "all") return true;
      return groupForNotificationType(n.type) === filter;
    });
  }, [data, filter, onlyUnread]);

  const unreadCount = useMemo(
    () => data?.notifications.filter((n) => !n.isRead).length ?? 0,
    [data],
  );
  const readCount = useMemo(
    () => data?.notifications.filter((n) => n.isRead).length ?? 0,
    [data],
  );

  const handleToggleRead = async (id: string, currentIsRead: boolean) => {
    const next = !currentIsRead;
    // Optimistic flip
    await mutate(
      (cur) =>
        cur
          ? {
              ...cur,
              notifications: cur.notifications.map((n) =>
                n.id === id ? { ...n, isRead: next } : n,
              ),
            }
          : cur,
      false,
    );
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: next }),
      });
      if (!res.ok) throw new Error("toggle_failed");
    } catch {
      // Rollback
      await mutate(
        (cur) =>
          cur
            ? {
                ...cur,
                notifications: cur.notifications.map((n) =>
                  n.id === id ? { ...n, isRead: currentIsRead } : n,
                ),
              }
            : cur,
        false,
      );
    } finally {
      await mutate();
    }
  };

  const handleClearRead = async () => {
    try {
      const res = await fetch("/api/notifications/clear-read", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("clear_failed");
      await mutate();
    } catch {
      // silent — list remains; user can retry
    }
  };

  // Auto-mark all visible-personal unread as read once on mount. The
  // filter-agnostic POST matches the page's intent: opening the surface
  // implies the user has «seen» these. Subsequent mounts are no-ops
  // because the ref guards the effect — we don't want a re-mark each
  // time the data refetches.
  useEffect(() => {
    if (autoMarkedRef.current) return;
    autoMarkedRef.current = true;
    void fetch("/api/notifications/read-all?context=personal", {
      method: "POST",
      credentials: "include",
    }).then(() => {
      void mutate();
    });
  }, [mutate]);

  const handleMarkAll = async () => {
    await mutate(
      (cur) =>
        cur
          ? {
              ...cur,
              notifications: cur.notifications.map((n) => ({ ...n, isRead: true })),
            }
          : cur,
      false,
    );
    try {
      await fetch("/api/notifications/read-all?context=personal", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      await mutate();
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-text-main lg:text-4xl">
            {T.title}
          </h1>
          <p className="mt-1 text-sm text-text-sec">{T.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={unreadCount === 0}
            onClick={handleMarkAll}
          >
            <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden />
            {T.markAllRead}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={readCount === 0}
            onClick={handleClearRead}
          >
            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
            Очистить прочитанные
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = opt.value === filter;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-primary text-white"
                  : "bg-bg-input text-text-sec hover:bg-bg-input/70 hover:text-text-main"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {opt.label}
            </button>
          );
        })}
        <label className="ml-auto inline-flex items-center gap-2 rounded-full bg-bg-input px-3 py-1.5 text-sm text-text-main">
          <Switch checked={onlyUnread} onCheckedChange={setOnlyUnread} />
          <span>{T.onlyUnread}</span>
        </label>
      </div>

      {error ? (
        <Card className="p-6 text-center text-sm text-text-sec">{T.loadFailed}</Card>
      ) : isLoading ? (
        <NotificationsSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onToggleRead={() => handleToggleRead(n.id, n.isRead)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({
  notification,
  onToggleRead,
}: {
  notification: NotificationItem;
  onToggleRead: () => void;
}) {
  const group = groupForNotificationType(notification.type);
  const Icon =
    FILTER_OPTIONS.find((o) => o.value === group)?.icon ?? Bell;
  const isUnread = !notification.isRead;
  const action = deriveAction(notification);

  return (
    <li>
      <Card
        className={`flex items-start gap-3 p-3.5 transition ${
          isUnread ? "border-primary/40 bg-bg-input/30" : ""
        }`}
      >
        <div
          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${
            isUnread ? "bg-primary/15 text-primary" : "bg-bg-input text-text-sec"
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {isUnread ? (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden
                  />
                ) : null}
                <span className="truncate text-sm font-semibold text-text-main">
                  {notification.title}
                </span>
              </div>
              {notification.body ? (
                <p className="mt-0.5 text-sm leading-relaxed text-text-sec">
                  {notification.body}
                </p>
              ) : null}
              <div className="mt-1 font-mono text-xs text-text-sec">
                {formatRelative(notification.createdAt)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {action ? (
                <Link href={action.href}>
                  <Button size="sm" variant="ghost">
                    {action.label}
                  </Button>
                </Link>
              ) : null}
              <button
                type="button"
                onClick={onToggleRead}
                className="text-xs font-medium text-text-sec hover:text-primary"
                title={isUnread ? T.markRead : T.markUnread}
              >
                {isUnread ? T.markRead : T.markUnread}
              </button>
            </div>
          </div>
        </div>
      </Card>
    </li>
  );
}

function deriveAction(n: NotificationItem): { href: string; label: string } | null {
  const bookingId = extractBookingId(n.payloadJson);
  const link = extractLink(n.payloadJson);
  if (bookingId) {
    if (n.type === "BOOKING_COMPLETED_REVIEW") {
      return {
        href: `/cabinet/bookings?review=${bookingId}`,
        label: T.actionLeaveReview,
      };
    }
    return {
      href: `/cabinet/bookings#${bookingId}`,
      label: T.actionOpen,
    };
  }
  if (link) {
    return { href: link, label: T.actionView };
  }
  return null;
}

function EmptyState() {
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center">
      <Inbox className="h-10 w-10 text-text-sec/40" aria-hidden />
      <div className="font-display text-base text-text-main">{T.empty}</div>
    </Card>
  );
}

function NotificationsSkeleton() {
  return (
    <ul className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <li key={i}>
          <Card className="h-16 animate-pulse bg-bg-input/40" />
        </li>
      ))}
    </ul>
  );
}

function formatRelative(iso: string): string {
  try {
    const date = new Date(iso);
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "только что";
    if (m < 60) return `${m} мин назад`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ч назад`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} дн назад`;
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}
