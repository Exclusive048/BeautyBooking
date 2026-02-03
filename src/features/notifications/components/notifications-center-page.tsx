"use client";

import { useMemo, useState } from "react";
import { StudioInviteCards } from "@/features/notifications/components/studio-invite-cards";
import type { NotificationCenterData } from "@/lib/notifications/center";
import { UI_FMT } from "@/lib/ui/fmt";

type FilterKey = "all" | "master" | "studio" | "system" | "invites";

type Props = {
  initialData: NotificationCenterData;
};

function chipClass(active: boolean): string {
  return active
    ? "rounded-md bg-black px-3 py-1 text-xs font-medium text-white"
    : "rounded-md border px-3 py-1 text-xs text-neutral-700";
}

export function NotificationsCenterPage({ initialData }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [invitesCount, setInvitesCount] = useState(initialData.invites.length);

  const filteredNotifications = useMemo(() => {
    if (filter === "all" || filter === "invites") return initialData.notifications;
    if (filter === "master") return initialData.notifications.filter((note) => note.channel === "MASTER");
    if (filter === "studio") return initialData.notifications.filter((note) => note.channel === "STUDIO");
    return initialData.notifications.filter((note) => note.channel === "SYSTEM");
  }, [filter, initialData.notifications]);

  const showInvites = filter === "all" || filter === "invites";
  const showTimeline = filter !== "invites";

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border bg-white p-4">
        <h1 className="text-xl font-semibold">Уведомления</h1>
        <p className="mt-1 text-sm text-neutral-600">Единый центр уведомлений: приглашения, мастерские, студийные и системные события.</p>
      </header>

      <div className="inline-flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilter("all")} className={chipClass(filter === "all")}>
          All
        </button>
        <button type="button" onClick={() => setFilter("master")} className={chipClass(filter === "master")}>
          Master
        </button>
        <button type="button" onClick={() => setFilter("studio")} className={chipClass(filter === "studio")}>
          Studio
        </button>
        <button type="button" onClick={() => setFilter("system")} className={chipClass(filter === "system")}>
          System
        </button>
        <button type="button" onClick={() => setFilter("invites")} className={chipClass(filter === "invites")}>
          Invites {invitesCount > 0 ? `(${invitesCount})` : ""}
        </button>
      </div>

      {showInvites ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Приглашения в студии</h2>
          {!initialData.hasPhone ? (
            <div className="rounded-xl border bg-white p-4 text-sm text-neutral-600">
              Добавьте номер телефона в профиль, чтобы получать приглашения.
            </div>
          ) : (
            <StudioInviteCards
              invites={initialData.invites}
              onChanged={(items) => {
                setInvitesCount(items.length);
              }}
            />
          )}
        </section>
      ) : null}

      {showTimeline ? (
        <section className="rounded-2xl border bg-white p-4">
          <div className="mb-3 text-sm font-semibold">Лента событий</div>
          <div className="space-y-2">
            {filteredNotifications.map((note) => (
              <article key={note.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{note.title}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-neutral-500">{note.channel}</div>
                  </div>
                  <div className="text-xs text-neutral-500">{UI_FMT.notificationTimeLabel(note.createdAt)}</div>
                </div>
                {note.body ? <div className="mt-2 text-sm text-neutral-700">{note.body}</div> : null}
              </article>
            ))}
            {filteredNotifications.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-neutral-500">По выбранному фильтру пока нет событий.</div>
            ) : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}
