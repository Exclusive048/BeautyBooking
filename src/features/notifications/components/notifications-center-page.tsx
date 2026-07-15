"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import {
  Bell,
  BellOff,
  Calendar,
  CheckCheck,
  CreditCard,
  Star,
  MessageCircle,
  Zap,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { StudioInviteCards } from "@/features/notifications/components/studio-invite-cards";
import { useActiveRole } from "@/lib/hooks/use-active-role";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import {
  PROFESSIONAL_GROUPS,
  centerGroupForType,
  type CenterNotificationGroup,
} from "@/lib/notifications/center-groups";
import { emitNotificationEvent, subscribeNotificationEvent } from "@/lib/notifications/client-bus";
import type { NotificationCenterData, NotificationChannel, NotificationCenterNotificationItem } from "@/lib/notifications/center";
import {
  isBookingActionNotification,
  resolveNotificationOpenHref,
  shouldRefreshInvitesForEvent,
} from "@/lib/notifications/presentation";
import type { NotificationEvent } from "@/lib/notifications/types";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

// NOTIFICATIONS-REDESIGN-01: was `"all" | "master" | "studio" | "system" |
// "invites"` — channel buckets offered identically to every viewer. Now a
// semantic group (or "all"); invites are a conditional section, not a tab.
type FilterKey = "all" | CenterNotificationGroup;

/**
 * Filter pill with a count, matching the `clientNotif` reference (type pills
 * carrying their own counts, active one filled with `primary`). Tokens only.
 */
function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid="notifications-filter-pill"
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border-subtle bg-bg-card text-text-main hover:bg-bg-input"
      }`}
    >
      {label}
      <span
        className={`tabular-nums text-xs ${active ? "text-primary-foreground/75" : "text-text-sec"}`}
      >
        {count}
      </span>
    </button>
  );
}

/** Display order of the filter pills — most actionable first, «Система» last. */
const GROUP_ORDER: readonly CenterNotificationGroup[] = [
  "bookings",
  "reminders",
  "reviews",
  "promo",
  "billing",
  "studio",
  "models",
  "system",
];

type Props = {
  initialData: NotificationCenterData;
};

type ChatPayload = {
  bookingId?: unknown;
  senderType?: unknown;
};

type BookingPayload = {
  bookingId?: unknown;
  bookingStatus?: unknown;
};

function parsePayloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null;
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") return payload as Record<string, unknown>;
  return null;
}

function parseBookingPayload(payload: unknown): { bookingId: string; bookingStatus?: string } | null {
  const record = parsePayloadRecord(payload) as BookingPayload | null;
  if (!record) return null;
  if (typeof record.bookingId !== "string" || record.bookingId.trim().length === 0) return null;
  const bookingStatus = typeof record.bookingStatus === "string" ? record.bookingStatus : undefined;
  return { bookingId: record.bookingId, bookingStatus };
}

function resolveBookingStatusMeta(status: string | undefined): { label: string; className: string } | null {
  const t = UI_TEXT.notificationsCenter.bookingStatus;
  if (!status) return null;
  const normalized = status.toUpperCase();
  switch (normalized) {
    case "CONFIRMED":
      return {
        label: t.confirmed,
        className: "border border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
      };
    case "REJECTED":
      return {
        label: t.rejected,
        className: "border border-rose-500/35 bg-rose-500/10 text-rose-300",
      };
    case "CANCELLED":
      return {
        label: t.cancelled,
        className: "border border-border-subtle bg-bg-input/65 text-text-sec",
      };
    case "NO_SHOW":
      return {
        label: t.noShow,
        className: "border border-border-subtle bg-bg-input/65 text-text-sec",
      };
    default:
      return null;
  }
}

function resolveIncomingChannel(event: NotificationEvent): NotificationChannel {
  const payload = parsePayloadRecord(event.payloadJson);
  if (payload) {
    const providerType = payload.providerType;
    if (providerType === "STUDIO") return "STUDIO";
    if (providerType === "MASTER") return "MASTER";
  }
  if (event.type === "CHAT_MESSAGE_RECEIVED") {
    const record = parseChatPayload(event.payloadJson);
    if (record?.senderType === "CLIENT") return "MASTER";
    return "SYSTEM";
  }
  if (event.type.startsWith("STUDIO_")) return "STUDIO";
  if (event.type === "BOOKING_CREATED" || event.type === "BOOKING_REQUEST") return "MASTER";
  if (
    event.type === "MODEL_APPLICATION_RECEIVED" ||
    event.type === "MODEL_NEW_APPLICATION" ||
    event.type === "MODEL_TIME_CONFIRMED"
  ) {
    return "MASTER";
  }
  return "SYSTEM";
}

function parseChatPayload(payload: unknown): { bookingId: string; senderType?: "CLIENT" | "MASTER" } | null {
  const record = parsePayloadRecord(payload) as ChatPayload | null;
  if (!record) return null;
  if (typeof record.bookingId !== "string" || record.bookingId.trim().length === 0) return null;
  const senderType =
    record.senderType === "CLIENT" || record.senderType === "MASTER" ? record.senderType : undefined;
  return { bookingId: record.bookingId, senderType };
}

function resolveChatOpenHref(payload: { bookingId: string; senderType?: "CLIENT" | "MASTER" }): string {
  const params = new URLSearchParams({ bookingId: payload.bookingId, chat: "open" });
  if (payload.senderType === "CLIENT") {
    return `/cabinet/master/dashboard?${params.toString()}`;
  }
  return `/cabinet/bookings?${params.toString()}`;
}

function toCenterItem(event: NotificationEvent): NotificationCenterNotificationItem {
  const resolveOpenHref = (): string | undefined => {
    if (
      event.type !== "MODEL_NEW_APPLICATION" &&
      event.type !== "MODEL_APPLICATION_RECEIVED" &&
      event.type !== "MODEL_TIME_PROPOSED" &&
      event.type !== "MODEL_APPLICATION_REJECTED" &&
      event.type !== "MODEL_BOOKING_CREATED" &&
      event.type !== "MODEL_TIME_CONFIRMED"
    ) {
      if (event.type !== "CHAT_MESSAGE_RECEIVED") return undefined;
    }
    const payload = parsePayloadRecord(event.payloadJson);
    if (!payload) return undefined;
    if (event.type === "CHAT_MESSAGE_RECEIVED") {
      const chatPayload = parseChatPayload(payload);
      return chatPayload ? resolveChatOpenHref(chatPayload) : undefined;
    }
    if (
      (event.type === "MODEL_TIME_PROPOSED" || event.type === "MODEL_APPLICATION_REJECTED") &&
      typeof payload.applicationId === "string"
    ) {
      return `/cabinet/model-applications?applicationId=${payload.applicationId}`;
    }
    if (typeof payload.offerId === "string") {
      // R2-06-C: the model-offers page reads `?filterOffer=`, not `?offerId=`.
      return `/cabinet/master/model-offers?filterOffer=${payload.offerId}`;
    }
    return resolveNotificationOpenHref(event.type, payload);
  };

  return {
    id: event.id,
    title: event.title,
    body: event.body,
    type: event.type as NotificationCenterNotificationItem["type"],
    channel: resolveIncomingChannel(event),
    isRead: false,
    readAt: null,
    createdAt: event.createdAt,
    payloadJson: event.payloadJson ?? null,
    openHref: resolveOpenHref(),
  };
}

function channelLabel(channel: "MASTER" | "STUDIO" | "SYSTEM"): string {
  const t = UI_TEXT.notificationsCenter.channels;
  if (channel === "MASTER") return t.master;
  if (channel === "STUDIO") return t.studio;
  return t.system;
}

function getNotificationIcon(type: string): LucideIcon {
  if (type.startsWith("BOOKING_")) return Calendar;
  if (type.startsWith("BILLING_") || type.startsWith("SUBSCRIPTION_")) return CreditCard;
  if (type.startsWith("REVIEW_")) return Star;
  if (type.startsWith("CHAT_")) return MessageCircle;
  if (type.startsWith("HOT_SLOT_")) return Zap;
  if (type.startsWith("STUDIO_")) return Building2;
  return Bell;
}

const listVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    },
  },
};

export function NotificationsCenterPage({ initialData }: Props) {
  const t = UI_TEXT.notificationsCenter;
  const viewerTimeZone = useViewerTimeZoneContext();
  const reduce = useReducedMotion();
  const listAnim = reduce ? undefined : listVariants;
  const itemAnim = reduce ? undefined : itemVariants;
  const [filter, setFilter] = useState<FilterKey>("all");
  const [invites, setInvites] = useState(initialData.invites);
  const [invitesCount, setInvitesCount] = useState(initialData.invites.length);
  const [notifications, setNotifications] = useState(initialData.notifications);
  const [onlyUnread, setOnlyUnread] = useState(false);
  // The app's existing role source (session-backed) — not a new role concept.
  const { hasMaster, hasStudio } = useActiveRole();
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const actionNoticeTimerRef = useRef<number | null>(null);
  const bookingActionText = t.bookingActions;

  const emitBellRefresh = (notificationId?: string) => {
    emitNotificationEvent({
      kind: "read",
      notificationId,
    });
  };

  useEffect(() => {
    setNotifications(initialData.notifications);
  }, [initialData.notifications]);

  useEffect(() => {
    setInvites(initialData.invites);
    setInvitesCount(initialData.invites.length);
  }, [initialData.invites]);

  useEffect(() => {
    return () => {
      if (actionNoticeTimerRef.current !== null) {
        window.clearTimeout(actionNoticeTimerRef.current);
      }
    };
  }, []);

  const showActionNotice = useCallback((tone: "success" | "error", text: string) => {
    if (actionNoticeTimerRef.current !== null) {
      window.clearTimeout(actionNoticeTimerRef.current);
    }
    setActionNotice({ tone, text });
    actionNoticeTimerRef.current = window.setTimeout(() => {
      setActionNotice(null);
      actionNoticeTimerRef.current = null;
    }, 3000);
  }, []);

  // Unchanged contract: same optimistic flip, same `/api/notifications/read-all`
  // POST, same `emitBellRefresh()` so the global bell re-reads its count.
  // Extracted from the mount effect only so the explicit «Прочитать все» button
  // can reuse it — schedule-requests stay untouched (they aren't Notification
  // rows and have no read state).
  const markAllRead = useCallback(async () => {
    setNotifications((current) =>
      current.map((note) =>
        note.id.startsWith("schedule-request:")
          ? note
          : {
              ...note,
              isRead: true,
              readAt: note.readAt ?? new Date().toISOString(),
            }
      )
    );
    try {
      await fetchWithAuth("/api/notifications/read-all", { method: "POST" });
      emitBellRefresh();
    } catch {
      // Ignore errors on mark-all.
      emitBellRefresh();
    }
  }, []);

  // PRESERVED behaviour (NOTIFICATIONS-REDESIGN-01): auto-mark-all-read on
  // mount. This mirrors the already-redesigned client cabinet page ("opening
  // the surface implies the user has «seen» these") and keeps the unread
  // semantics the bell depends on exactly as they were. Whether it should
  // become explicit-only is an open product question for Artem — deliberately
  // NOT decided here.
  useEffect(() => {
    void markAllRead();
  }, [markAllRead]);

  const markNotificationRead = async (noteId: string) => {
    if (noteId.startsWith("schedule-request:")) return;
    setNotifications((current) =>
      current.map((note) =>
        note.id === noteId
          ? { ...note, isRead: true, readAt: note.readAt ?? new Date().toISOString() }
          : note
      )
    );
    try {
      await fetchWithAuth(`/api/notifications/${noteId}/read`, { method: "POST" });
      emitBellRefresh(noteId);
    } catch {
      // Ignore errors on mark read.
      emitBellRefresh(noteId);
    }
  };

  const reloadCenterData = useCallback(async () => {
    const res = await fetchWithAuth("/api/notifications/center", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as ApiResponse<NotificationCenterData> | null;
    if (!res.ok || !json || !json.ok) {
      throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
    }
    setInvites(json.data.invites);
    setNotifications(json.data.notifications);
    setInvitesCount(json.data.invites.length);
    emitBellRefresh();
  }, []);

  const handleBookingConfirm = async (noteId: string, payload: unknown) => {
    const booking = parseBookingPayload(payload);
    if (!booking) {
      showActionNotice("error", bookingActionText.resolveForConfirmFailed);
      return;
    }
    setActionPendingId(noteId);
    try {
      const res = await fetchWithAuth(`/api/bookings/${booking.bookingId}/confirm`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setNotifications((current) =>
        current.map((note) => {
          if (note.id !== noteId) return note;
          const payloadRecord = parsePayloadRecord(note.payloadJson);
          const payloadJson =
            payloadRecord
              ? { ...payloadRecord, bookingStatus: "CONFIRMED" }
              : note.payloadJson;
          return {
            ...note,
            isRead: true,
            readAt: note.readAt ?? new Date().toISOString(),
            payloadJson,
          };
        })
      );
      await markNotificationRead(noteId);
      try {
        await reloadCenterData();
      } catch {
        // ignore refresh errors
      }
      showActionNotice("success", bookingActionText.confirmSuccess);
    } catch {
      showActionNotice("error", bookingActionText.confirmFailed);
    } finally {
      setActionPendingId(null);
    }
  };

  const handleBookingDecline = async (noteId: string, payload: unknown) => {
    const booking = parseBookingPayload(payload);
    if (!booking) {
      showActionNotice("error", bookingActionText.resolveForDeclineFailed);
      return;
    }
    setActionPendingId(noteId);
    try {
      const res = await fetchWithAuth(`/api/bookings/${booking.bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: UI_TEXT.notifications.declineReason }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setNotifications((current) =>
        current.map((note) => {
          if (note.id !== noteId) return note;
          const payloadRecord = parsePayloadRecord(note.payloadJson);
          const payloadJson =
            payloadRecord
              ? { ...payloadRecord, bookingStatus: "REJECTED" }
              : note.payloadJson;
          return {
            ...note,
            isRead: true,
            readAt: note.readAt ?? new Date().toISOString(),
            payloadJson,
          };
        })
      );
      await markNotificationRead(noteId);
      try {
        await reloadCenterData();
      } catch {
        // ignore refresh errors
      }
      showActionNotice("success", bookingActionText.declineSuccess);
    } catch {
      showActionNotice("error", bookingActionText.declineFailed);
    } finally {
      setActionPendingId(null);
    }
  };

  useEffect(() => {
    return subscribeNotificationEvent((event) => {
      if (event.kind === "incoming" && event.notification) {
        if (shouldRefreshInvitesForEvent(event.notification.type)) {
          void reloadCenterData();
        }
        const incoming = toCenterItem(event.notification);
        setNotifications((current) => {
          const existingIndex = current.findIndex((note) => note.id === incoming.id);
          if (existingIndex === -1) return [incoming, ...current];
          const next = [...current];
          const existing = next[existingIndex];
          next[existingIndex] = {
            ...existing,
            ...incoming,
            isRead: existing.isRead,
            readAt: existing.readAt,
          };
          return next;
        });
        return;
      }

      if ((event.kind === "updated" || event.kind === "read") && event.notificationId) {
        const timestamp = new Date().toISOString();
        setNotifications((current) =>
          current.map((note) =>
            note.id === event.notificationId
              ? { ...note, isRead: true, readAt: note.readAt ?? timestamp }
              : note
          )
        );
      }
    });
  }, [reloadCenterData]);

  // Role-aware filter set. Two gates, both required:
  //   1. ROLE — professional groups (Оплаты/Студия/Модели) are only offered to a
  //      viewer who holds that role (`useActiveRole` — the app's existing role
  //      source, read from the session; no new role concept invented here).
  //   2. DATA — a pill only appears if it actually has items. This is what makes
  //      the page honest: we never advertise a category that would open empty,
  //      and it needs no per-role allowlist to maintain.
  const groupCounts = useMemo(() => {
    const counts = new Map<CenterNotificationGroup, number>();
    for (const note of notifications) {
      const group = centerGroupForType(note.type);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return counts;
  }, [notifications]);

  const availableFilters = useMemo(() => {
    const eligible = (group: CenterNotificationGroup) =>
      !PROFESSIONAL_GROUPS.has(group) || hasMaster || hasStudio;
    return GROUP_ORDER.filter((group) => (groupCounts.get(group) ?? 0) > 0 && eligible(group));
  }, [groupCounts, hasMaster, hasStudio]);

  // A filter the viewer no longer has data for (e.g. the last item of a group
  // got cleared) must not strand the list on an empty selection.
  useEffect(() => {
    if (filter !== "all" && !availableFilters.includes(filter)) setFilter("all");
  }, [availableFilters, filter]);

  const visibleNotifications = useMemo(() => {
    return notifications.filter((note) => {
      if (onlyUnread && note.isRead) return false;
      if (filter === "all") {
        // Never surface a professional group to a role that can't act on it.
        const group = centerGroupForType(note.type);
        return !PROFESSIONAL_GROUPS.has(group) || hasMaster || hasStudio;
      }
      return centerGroupForType(note.type) === filter;
    });
  }, [filter, hasMaster, hasStudio, notifications, onlyUnread]);

  // Invites are gated on CONTENT, not role: a studio invite is matched by phone,
  // so a pure client can legitimately receive one and must be able to act on it.
  // Previously this card rendered unconditionally (even at zero, showing a «Нет
  // активных приглашений» placeholder to every user forever).
  const showInvites = invitesCount > 0 && filter === "all";
  const unreadTotal = useMemo(
    () => notifications.filter((note) => !note.isRead).length,
    [notifications]
  );
  /** «Все» pill count — role-filtered, ignoring the unread toggle. */
  const visibleTotal = useMemo(
    () =>
      notifications.filter((note) => {
        const group = centerGroupForType(note.type);
        return !PROFESSIONAL_GROUPS.has(group) || hasMaster || hasStudio;
      }).length,
    [hasMaster, hasStudio, notifications]
  );

  return (
    <section className="space-y-5" data-testid="notifications-center">
      {/* Page header — cabinet standard: title + subtitle left, actions right. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-main">
            {t.title}
          </h1>
          <p className="mt-1 text-sm text-text-sec">{t.subtitle}</p>
        </div>
        {unreadTotal > 0 ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-lg"
            onClick={() => void markAllRead()}
            data-testid="notifications-mark-all"
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t.markAllRead}
          </Button>
        ) : null}
      </div>

      {/* Filters — semantic groups, role- and data-gated. Rendered only when
          there's more than one thing to choose between. */}
      {availableFilters.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide"
            data-testid="notifications-filters"
          >
            <FilterPill
              label={t.filters.all}
              count={visibleTotal}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            {availableFilters.map((group) => (
              <FilterPill
                key={group}
                label={t.filters[group]}
                count={groupCounts.get(group) ?? 0}
                active={filter === group}
                onClick={() => setFilter(group)}
              />
            ))}
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-text-sec">
            <Switch
              checked={onlyUnread}
              onCheckedChange={setOnlyUnread}
              aria-label={t.onlyUnread}
              data-testid="notifications-only-unread"
            />
            {t.onlyUnread}
          </label>
        </div>
      ) : null}

      {/* Action notice toast */}
      <AnimatePresence>
        {actionNotice ? (
          <motion.div
            key="action-notice"
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={reduce ? { duration: 0 } : { duration: 0.2 }}
            className={`rounded-2xl border px-4 py-3 text-sm ${
              actionNotice.tone === "success"
                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/35 bg-rose-500/10 text-rose-300"
            }`}
          >
            {actionNotice.text}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Invites — conditional section. NOTIFICATIONS-REDESIGN-01: this card
          used to render for every visitor on «Все», showing a permanent «Нет
          активных приглашений» placeholder (and an «Приглашения» tab) to people
          who will never join a studio. Now it exists only when there is
          something to act on.
          The old `hasPhone` branch is gone with it: invites are matched by phone
          server-side, so no phone ⇒ no invites ⇒ this block never renders — the
          «add a phone» prompt was unreachable advice aimed at the wrong surface. */}
      {showInvites ? (
        <div
          className="rounded-[22px] border border-border-subtle bg-bg-card p-5 shadow-card md:p-6"
          data-testid="notifications-invites"
        >
          <h2 className="mb-3 text-sm font-semibold text-text-main">{t.invitesTitle}</h2>
          <StudioInviteCards
            invites={invites}
            onChanged={(items) => {
              setInvites(items);
              setInvitesCount(items.length);
            }}
          />
        </div>
      ) : null}

      {/* Notifications timeline. Always rendered now — «Приглашения» is no
          longer a tab that replaces the feed, it's a section above it. */}
      {visibleNotifications.length > 0 ? (
          <motion.div
            className="space-y-2"
            initial="hidden"
            animate="visible"
            variants={listAnim}
            data-testid="notifications-list"
          >
            <AnimatePresence>
              {visibleNotifications.map((note) => {
                const bookingPayload = parseBookingPayload(note.payloadJson);
                const bookingStatus = bookingPayload?.bookingStatus?.toUpperCase();
                const canAct =
                  isBookingActionNotification(note.type) &&
                  bookingPayload?.bookingId &&
                  (!bookingStatus || bookingStatus === "PENDING" || bookingStatus === "NEW");
                const statusMeta =
                  isBookingActionNotification(note.type) && bookingPayload?.bookingId
                    ? resolveBookingStatusMeta(bookingStatus)
                    : null;
                const isUnread = !note.isRead;
                const Icon = getNotificationIcon(note.type);

                return (
                  <motion.article
                    key={note.id}
                    layout
                    variants={itemAnim}
                    data-testid="notification-row"
                    data-group={centerGroupForType(note.type)}
                    data-unread={isUnread ? "true" : "false"}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                    className={`relative flex gap-3 rounded-2xl border p-4 transition-colors ${
                      isUnread
                        ? "border-primary/20 bg-primary/5"
                        : "border-border-subtle bg-bg-input/55"
                    }`}
                    onClick={() => void markNotificationRead(note.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void markNotificationRead(note.id);
                    }}
                  >
                    {/* Unread dot */}
                    {isUnread && (
                      <span className="absolute right-3.5 top-3.5 h-2 w-2 rounded-full bg-primary" />
                    )}

                    {/* Type icon */}
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                        isUnread ? "bg-primary/15" : "bg-bg-card"
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${isUnread ? "text-accent-text" : "text-text-sec"}`}
                        aria-hidden
                      />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-sm leading-snug ${
                            isUnread
                              ? "font-semibold text-text-main"
                              : "font-medium text-text-main"
                          }`}
                        >
                          {note.title}
                        </span>
                        <span className="shrink-0 text-xs text-text-sec">
                          {UI_FMT.notificationTimeLabel(note.createdAt, { timeZone: viewerTimeZone })}
                        </span>
                      </div>

                      {note.body ? (
                        <p className="mt-1 line-clamp-2 text-sm text-text-sec">{note.body}</p>
                      ) : null}

                      <span className="mt-1.5 inline-block rounded-md bg-bg-card px-2 py-0.5 text-[10px] text-text-sec">
                        {channelLabel(note.channel)}
                      </span>

                      {canAct ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleBookingConfirm(note.id, note.payloadJson);
                            }}
                            disabled={actionPendingId === note.id}
                          >
                            {UI_TEXT.actions.confirm}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleBookingDecline(note.id, note.payloadJson);
                            }}
                            disabled={actionPendingId === note.id}
                          >
                            {UI_TEXT.actions.decline}
                          </Button>
                        </div>
                      ) : null}

                      {!canAct && statusMeta ? (
                        <div className="mt-3">
                          <span
                            className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-medium ${statusMeta.className}`}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                      ) : null}

                      {note.openHref ? (
                        <div className="mt-3">
                          <Button
                            asChild
                            size="sm"
                            variant="secondary"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Link href={note.openHref}>{t.openAction}</Link>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </motion.div>
      ) : (
        // Empty state — one line + one action, per convention. «Показать все»
        // only appears when a filter/toggle is what's hiding things; with a
        // genuinely empty inbox there is nothing to reset to.
        <div
          className="flex flex-col items-center justify-center py-16 text-center"
          data-testid="notifications-empty"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-input">
            <BellOff className="h-8 w-8 text-text-sec" aria-hidden />
          </div>
          <p className="mt-4 font-medium text-text-main">
            {filter === "all" && !onlyUnread ? t.emptyAll : t.emptyFilter}
          </p>
          {filter === "all" && !onlyUnread ? (
            <p className="mt-1.5 max-w-xs text-sm text-text-sec">{t.emptyAllSub}</p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-4 rounded-lg"
              onClick={() => {
                setFilter("all");
                setOnlyUnread(false);
              }}
            >
              {t.showAll}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
