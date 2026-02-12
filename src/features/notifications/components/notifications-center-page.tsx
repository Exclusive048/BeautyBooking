"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { StudioInviteCards } from "@/features/notifications/components/studio-invite-cards";
import { emitNotificationEvent, subscribeNotificationEvent } from "@/lib/notifications/client-bus";
import type { NotificationCenterData, NotificationChannel, NotificationCenterNotificationItem } from "@/lib/notifications/center";
import type { NotificationEvent } from "@/lib/notifications/notifier";
import type { ApiResponse } from "@/lib/types/api";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type FilterKey = "all" | "master" | "studio" | "system" | "invites";

type Props = {
  initialData: NotificationCenterData;
};

function resolveIncomingChannel(event: NotificationEvent): NotificationChannel {
  const payload = event.payloadJson;
  if (payload && typeof payload === "object") {
    const providerType = (payload as { providerType?: unknown }).providerType;
    if (providerType === "STUDIO") return "STUDIO";
    if (providerType === "MASTER") return "MASTER";
  }
  if (event.type === "BOOKING_REQUEST") return "MASTER";
  if (event.type === "MODEL_NEW_APPLICATION" || event.type === "MODEL_BOOKING_CREATED") return "MASTER";
  return "SYSTEM";
}

function toCenterItem(event: NotificationEvent): NotificationCenterNotificationItem {
  const resolveOpenHref = (): string | undefined => {
    if (
      event.type !== "MODEL_NEW_APPLICATION" &&
      event.type !== "MODEL_TIME_PROPOSED" &&
      event.type !== "MODEL_APPLICATION_REJECTED" &&
      event.type !== "MODEL_BOOKING_CREATED"
    ) {
      return undefined;
    }
    const payload = event.payloadJson;
    if (!payload || typeof payload !== "object") return undefined;
    const record = payload as { offerId?: unknown; applicationId?: unknown };
    if ((event.type === "MODEL_TIME_PROPOSED" || event.type === "MODEL_APPLICATION_REJECTED") && typeof record.applicationId === "string") {
      return `/cabinet/model-applications?applicationId=${record.applicationId}`;
    }
    if (typeof record.offerId === "string") {
      return `/cabinet/master/model-offers?offerId=${record.offerId}`;
    }
    return undefined;
  };

  return {
    id: event.id,
    title: event.title,
    body: event.body,
    type: event.type,
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
  const [filter, setFilter] = useState<FilterKey>("all");
  const [invitesCount, setInvitesCount] = useState(initialData.invites.length);
  const [notifications, setNotifications] = useState(initialData.notifications);
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

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
        await fetch("/api/notifications/read-all", { method: "POST" });
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
      await fetch(`/api/notifications/${noteId}/read`, { method: "POST" });
      emitBellRefresh(noteId);
    } catch {
      // Ignore errors on mark read.
      emitBellRefresh(noteId);
    }
  };

  const parseBookingPayload = (payload: unknown): { bookingId: string; bookingStatus?: string } | null => {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as { bookingId?: unknown; bookingStatus?: unknown };
    if (typeof record.bookingId !== "string" || record.bookingId.trim().length === 0) return null;
    const bookingStatus = typeof record.bookingStatus === "string" ? record.bookingStatus : undefined;
    return { bookingId: record.bookingId, bookingStatus };
  };

  const handleBookingConfirm = async (noteId: string, payload: unknown) => {
    const booking = parseBookingPayload(payload);
    if (!booking) return;
    setActionPendingId(noteId);
    try {
      const res = await fetch(`/api/bookings/${booking.bookingId}/confirm`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setNotifications((current) =>
        current.map((note) => {
          if (note.id !== noteId) return note;
          const payloadJson =
            note.payloadJson && typeof note.payloadJson === "object"
              ? { ...(note.payloadJson as Record<string, unknown>), bookingStatus: "CONFIRMED" }
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
    } catch (error) {
      console.error("Failed to confirm booking from notification", error);
    } finally {
      setActionPendingId(null);
    }
  };

  const handleBookingDecline = async (noteId: string, payload: unknown) => {
    const booking = parseBookingPayload(payload);
    if (!booking) return;
    setActionPendingId(noteId);
    try {
      const res = await fetch(`/api/bookings/${booking.bookingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Отклонено" }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setNotifications((current) =>
        current.map((note) => {
          if (note.id !== noteId) return note;
          const payloadJson =
            note.payloadJson && typeof note.payloadJson === "object"
              ? { ...(note.payloadJson as Record<string, unknown>), bookingStatus: "DECLINED" }
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
    } catch (error) {
      console.error("Failed to decline booking from notification", error);
    } finally {
      setActionPendingId(null);
    }
  };

  useEffect(() => {
    return subscribeNotificationEvent((event) => {
      if (event.kind === "incoming" && event.notification) {
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
  }, []);

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
                invites={initialData.invites}
                onChanged={(items) => {
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
              const canAct =
                note.type === "BOOKING_REQUEST" &&
                bookingPayload?.bookingId &&
                (!bookingPayload.bookingStatus || bookingPayload.bookingStatus === "PENDING");
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
                    <div className="text-xs text-text-sec">{UI_FMT.notificationTimeLabel(note.createdAt)}</div>
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
                        Подтвердить
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
                        Отклонить
                      </Button>
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
