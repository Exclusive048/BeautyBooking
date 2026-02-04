"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { StudioInviteCards } from "@/features/notifications/components/studio-invite-cards";
import type { NotificationCenterData } from "@/lib/notifications/center";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

type FilterKey = "all" | "master" | "studio" | "system" | "invites";

type Props = {
  initialData: NotificationCenterData;
};

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

  const filteredNotifications = useMemo(() => {
    if (filter === "all" || filter === "invites") return initialData.notifications;
    if (filter === "master") return initialData.notifications.filter((note) => note.channel === "MASTER");
    if (filter === "studio") return initialData.notifications.filter((note) => note.channel === "STUDIO");
    return initialData.notifications.filter((note) => note.channel === "SYSTEM");
  }, [filter, initialData.notifications]);

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
            {filteredNotifications.map((note) => (
              <article key={note.id} className="rounded-2xl border border-border-subtle bg-bg-input/55 p-3">
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
                {note.openHref ? (
                  <div className="mt-3">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={note.openHref}>{t.openAction}</Link>
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
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
