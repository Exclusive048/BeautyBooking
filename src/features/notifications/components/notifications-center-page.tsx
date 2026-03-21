"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { StudioInviteCards } from "@/features/notifications/components/studio-invite-cards";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import { emitNotificationEvent, subscribeNotificationEvent } from "@/lib/notifications/client-bus";
import type { NotificationCenterData, NotificationChannel, NotificationCenterNotificationItem } from "@/lib/notifications/center";
import { isBookingActionNotification, shouldRefreshInvitesForEvent } from "@/lib/notifications/presentation";
import type { NotificationEvent } from "@/lib/notifications/types";
import type { ApiResponse } from "@/lib/types/api";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type FilterKey = "all" | "master" | "studio" | "system" | "invites";

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
  if (!status) return null;
  const normalized = status.toUpperCase();
  switch (normalized) {
    case "CONFIRMED":
      return {
        label: "Подтверждено",
        className: "border border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
      };
    case "REJECTED":
      return {
        label: "Отклонено",
        className: "border border-rose-500/35 bg-rose-500/10 text-rose-300",
      };
    case "CANCELLED":
      return {
        label: "Отменено",
        className: "border border-border-subtle bg-bg-input/65 text-text-sec",
      };
    case "NO_SHOW":
      return {
        label: "Неявка",
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
      return `/cabinet/master/model-offers?offerId=${payload.offerId}`;
    }
    return undefined;
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

export function NotificationsCenterPage({ initialData }: Props) {
  const t = UI_TEXT.notificationsCenter;
  const viewerTimeZone = useViewerTimeZoneContext();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [invites, setInvites] = useState(initialData.invites);
  const [invitesCount, setInvitesCount] = useState(initialData.invites.length);
  const [notifications, setNotifications] = useState(initialData.notifications);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const actionNoticeTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    const markAllRead = async () => {
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
    };

    void markAllRead();
  }, []);

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
      showActionNotice("error", "Не удалось определить запись для подтверждения");
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
      } catch (reloadError) {
        console.error("Failed to refresh notification center after confirm", reloadError);
      }
      showActionNotice("success", "Запись подтверждена");
    } catch (error) {
      console.error("Failed to confirm booking from notification", error);
      showActionNotice("error", "Не удалось подтвердить запись — попробуйте ещё раз");
    } finally {
      setActionPendingId(null);
    }
  };

  const handleBookingDecline = async (noteId: string, payload: unknown) => {
    const booking = parseBookingPayload(payload);
    if (!booking) {
      showActionNotice("error", "Не удалось определить запись для отклонения");
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
      } catch (reloadError) {
        console.error("Failed to refresh notification center after decline", reloadError);
      }
      showActionNotice("success", "Запись отклонена");
    } catch (error) {
      console.error("Failed to decline booking from notification", error);
      showActionNotice("error", "Не удалось отклонить запись — попробуйте ещё раз");
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

  const filteredNotifications = useMemo(() => {
    if (filter === "all" || filter === "invites") return notifications;
    if (filter === "master") return notifications.filter((note) => note.channel === "MASTER");
    if (filter === "studio") return notifications.filter((note) => note.channel === "STUDIO");
    return notifications.filter((note) => note.channel === "SYSTEM");
  }, [filter, notifications]);

  const filterItems: TabItem[] = useMemo(
    () => [
      { id: "all", label: t.filters.all },
      { id: "master", label: t.filters.master },
      { id: "studio", label: t.filters.studio },
      { id: "system", label: t.filters.system },
      { id: "invites", label: t.filters.invites, badge: invitesCount > 0 ? invitesCount : undefined },
    ],
    [invitesCount, t.filters.all, t.filters.invites, t.filters.master, t.filters.studio, t.filters.system]
  );

  const showInvites = filter === "all" || filter === "invites";
  const showTimeline = filter !== "invites";

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="p-5 md:p-6">
          <h1 className="text-xl font-semibold text-text-main">{t.title}</h1>
          <p className="mt-1 text-sm text-text-sec">{t.subtitle}</p>
        </CardHeader>
      </Card>

      <Tabs items={filterItems} value={filter} onChange={(value) => setFilter(value as FilterKey)} />
      {actionNotice ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            actionNotice.tone === "success"
              ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/35 bg-rose-500/10 text-rose-300"
          }`}
        >
          {actionNotice.text}
        </div>
      ) : null}

      {showInvites ? (
        <Card>
          <CardHeader className="p-5 pb-3 md:p-6 md:pb-3">
            <h2 className="text-sm font-semibold text-text-main">{t.invitesTitle}</h2>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5 md:px-6 md:pb-6">
            {!initialData.hasPhone ? (
              <div className="rounded-2xl border border-border-subtle bg-bg-input/65 p-4 text-sm text-text-sec">
                {t.phoneRequired}
              </div>
            ) : (
              <StudioInviteCards
                invites={invites}
                onChanged={(items) => {
                  setInvites(items);
                  setInvitesCount(items.length);
                }}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {showTimeline ? (
        <Card>
          <CardHeader className="p-5 pb-3 md:p-6 md:pb-3">
            <h2 className="text-sm font-semibold text-text-main">{t.timelineTitle}</h2>
          </CardHeader>
          <CardContent className="space-y-2 px-5 pb-5 md:px-6 md:pb-6">
            {filteredNotifications.map((note) => {
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

              return (
                <article
                  key={note.id}
                  className={`rounded-2xl border border-border-subtle p-3 ${
                    isUnread ? "bg-bg-card/75 shadow-card" : "bg-bg-input/55"
                  }`}
                  onClick={() => void markNotificationRead(note.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void markNotificationRead(note.id);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-text-main">{note.title}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-wide text-text-sec">
                        {channelLabel(note.channel)}
                      </div>
                    </div>
                    <div className="text-xs text-text-sec">
                      {UI_FMT.notificationTimeLabel(note.createdAt, { timeZone: viewerTimeZone })}
                    </div>
                  </div>
                  {note.body ? <div className="mt-2 text-sm text-text-sec">{note.body}</div> : null}

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
                </article>
              );
            })}
            {filteredNotifications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-subtle p-4 text-sm text-text-sec">
                {t.emptyTimeline}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
