"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiResponse } from "@/lib/types/api";

type InviteItem = {
  id: string;
  studio: {
    id: string;
    provider: { name: string; tagline: string | null };
  };
};

type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

type Props = {
  invites: InviteItem[];
  notifications: NotificationItem[];
  unreadCount: number;
  hasPhone: boolean;
};

export function InvitesPanel({ invites, notifications, unreadCount, hasPhone }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<InviteItem[]>(invites);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canShowInvites = hasPhone;

  const hasUnread = unreadCount > 0;

  const formatDate = useMemo(() => {
    return (value: string) => new Date(value).toLocaleString("ru-RU");
  }, []);

  const postAction = async (url: string, inviteId: string) => {
    setSavingId(inviteId);
    setError(null);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = (await res.json().catch(() => null)) as ApiResponse<{ inviteId: string }> | null;
      const message = data && !data.ok ? data.error.message : null;

      if (!res.ok) {
        setError(message ?? "Не удалось выполнить действие");
        return;
      }

      if (!data || !data.ok) {
        setError(message ?? "Не удалось выполнить действие");
        return;
      }

      setItems((prev) => prev.filter((i) => i.id !== inviteId));
      router.refresh();
    } catch {
      setError("Сеть недоступна или сервер не отвечает");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Приглашения и уведомления</h1>
        <p className="text-sm text-neutral-600">Приглашения и новости по вашим студиям.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Приглашения</h2>
        {!canShowInvites ? (
          <div className="rounded-2xl border p-4 text-sm text-neutral-600">
            Укажите номер телефона в профиле, чтобы получать приглашения.
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border p-4 text-sm text-neutral-600">
            Пока нет приглашений.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((invite) => (
              <div key={invite.id} className="rounded-2xl border p-4">
                <div className="text-sm text-neutral-500">Студия</div>
                <div className="text-lg font-semibold">{invite.studio.provider.name}</div>
                {invite.studio.provider.tagline ? (
                  <div className="text-sm text-neutral-600">{invite.studio.provider.tagline}</div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => postAction(`/api/invites/${invite.id}/accept`, invite.id)}
                    disabled={savingId === invite.id}
                    className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {savingId === invite.id ? "Принимаем..." : "Принять"}
                  </button>
                  <button
                    type="button"
                    onClick={() => postAction(`/api/invites/${invite.id}/reject`, invite.id)}
                    disabled={savingId === invite.id}
                    className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {savingId === invite.id ? "Отклоняем..." : "Отклонить"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {error ? (
          <div className="rounded-2xl border p-4 text-sm text-red-600">Ошибка: {error}</div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Новости и уведомления</h2>
          {hasUnread ? (
            <form action="/api/notifications/read-all" method="POST">
              <button className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-50">
                Отметить все прочитанными
              </button>
            </form>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <div className="rounded-2xl border p-4 text-sm text-neutral-600">
            Пока нет уведомлений.
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((note) => (
              <div key={note.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{note.title}</div>
                  <div className="text-xs text-neutral-500">{formatDate(note.createdAt)}</div>
                </div>
                {note.body ? (
                  <div className="mt-1 text-sm text-neutral-700">{note.body}</div>
                ) : null}
                {!note.readAt ? (
                  <div className="mt-2 text-xs text-blue-600">Новое</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
