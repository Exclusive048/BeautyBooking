"use client";

import Link from "next/link";
import { useState } from "react";
import type { NotificationCenterInviteItem } from "@/lib/notifications/center";
import type { ApiResponse } from "@/lib/types/api";

type Props = {
  invites: NotificationCenterInviteItem[];
  onChanged?: (items: NotificationCenterInviteItem[]) => void;
  className?: string;
};

export function StudioInviteCards({ invites, onChanged, className }: Props) {
  const [items, setItems] = useState<NotificationCenterInviteItem[]>(invites);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const postInviteAction = async (inviteId: string, action: "accept" | "reject") => {
    setSavingId(inviteId);
    setError(null);
    try {
      const response = await fetch(`/api/invites/${inviteId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<{ inviteId: string }> | null;
      if (!response.ok || !json || !json.ok) {
        setError(json && !json.ok ? json.error.message : "Не удалось выполнить действие");
        return;
      }

      const nextItems = items.filter((invite) => invite.id !== inviteId);
      setItems(nextItems);
      onChanged?.(nextItems);
    } catch {
      setError("Сеть недоступна или сервер не отвечает");
    } finally {
      setSavingId(null);
    }
  };

  if (items.length === 0) {
    return <div className="rounded-xl border bg-white p-4 text-sm text-neutral-600">Нет активных приглашений.</div>;
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {items.map((invite) => (
          <article key={invite.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-start gap-3">
              {invite.studioAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={invite.studioAvatarUrl}
                  alt={invite.studioName}
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-neutral-200" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Админ студии {invite.studioName} приглашает вас стать мастером</div>
                {invite.studioTagline ? <div className="mt-1 text-xs text-neutral-500">{invite.studioTagline}</div> : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void postInviteAction(invite.id, "accept")}
                disabled={savingId === invite.id}
                className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                {savingId === invite.id ? "Принимаем..." : "Принять"}
              </button>
              <button
                type="button"
                onClick={() => void postInviteAction(invite.id, "reject")}
                disabled={savingId === invite.id}
                className="rounded-lg border px-3 py-2 text-sm disabled:opacity-60"
              >
                {savingId === invite.id ? "Отклоняем..." : "Отклонить"}
              </button>
              <Link href={`/studios/${invite.studioId}`} className="rounded-lg border px-3 py-2 text-sm">
                Профиль студии
              </Link>
            </div>
          </article>
        ))}
      </div>
      {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    </div>
  );
}
