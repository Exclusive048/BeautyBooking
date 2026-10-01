"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import type { NotificationCenterInviteItem } from "@/lib/notifications/center";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { providerPublicUrl } from "@/lib/public-urls";
import { useRevalidateMe } from "@/lib/hooks/use-me";

type Props = {
  invites: NotificationCenterInviteItem[];
  onChanged?: (items: NotificationCenterInviteItem[]) => void;
  className?: string;
};

/** «Вас приглашают в команду «Студия Ольги»» — название подсвечено. */
function InviteTitle({ studioName }: { studioName: string }) {
  const t = UI_TEXT.notificationsCenter.invites;
  const name = studioName.trim();
  if (!name) return <>{t.titleNoName}</>;
  const [before, after = ""] = t.titleTemplate.split("{name}");
  return (
    <>
      {before}
      <span className="text-accent-text">{name}</span>
      {after}
    </>
  );
}

export function StudioInviteCards({ invites, onChanged, className }: Props) {
  const t = UI_TEXT.notificationsCenter.invites;
  const tCenter = UI_TEXT.notificationsCenter;
  const [items, setItems] = useState<NotificationCenterInviteItem[]>(invites);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const revalidateMe = useRevalidateMe();

  useEffect(() => {
    setItems(invites);
  }, [invites]);

  const removeInviteLocally = (inviteId: string) => {
    setItems((current) => {
      const nextItems = current.filter((invite) => invite.id !== inviteId);
      queueMicrotask(() => onChanged?.(nextItems));
      return nextItems;
    });
  };

  const postInviteAction = async (inviteId: string, action: "accept" | "reject") => {
    setSavingId(inviteId);
    setError(null);
    try {
      try {
        await fetchJsonWithAuth<{ inviteId: string }>(`/api/invites/${inviteId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch (error) {
        // Приглашение уже неактивно (отозвано, принято, отклонено) — убрать
        // карточку и сказать своей строкой; прочее — дословно.
        const code = error instanceof ApiClientError ? String(error.code ?? "") : "";
        if (
          code === "INVITE_REVOKED" ||
          code === "INVITE_NOT_FOUND" ||
          code === "INVITE_ALREADY_ACCEPTED" ||
          code === "INVITE_ALREADY_REJECTED"
        ) {
          removeInviteLocally(inviteId);
          setError(t.inactive);
          return;
        }
        if (!(error instanceof ApiClientError)) throw error;
        setError(serverMessageOr(error, t.actionFailed));
        return;
      }

      removeInviteLocally(inviteId);
      if (action === "accept") {
        // INVITE-ROLE-REFRESH: принятие даёт кабинет мастера и роль MASTER.
        // Шапка — серверный компонент корневого layout'а, мягкая навигация её
        // не перерисовывает; нижняя навигация держит `/api/me` в SWR. Без
        // обоих сбросов «Стать мастером» висело до перезагрузки.
        void revalidateMe();
        router.refresh();
      }
    } catch {
      setError(t.networkError);
    } finally {
      setSavingId(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-input/65 p-4 text-sm text-text-sec">
        {tCenter.noActiveInvites}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {items.map((invite) => (
          <div
            key={invite.id}
            className="rounded-3xl border border-border-subtle/80 bg-bg-card p-4 shadow-card"
          >
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-bg-input">
                {invite.studioAvatarUrl ? (
                  <ResilientImage
                    src={invite.studioAvatarUrl}
                    alt={invite.studioName}
                    width={48}
                    height={48}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-text-main">
                  <InviteTitle studioName={invite.studioName} />
                </div>
                {invite.studioTagline ? (
                  <div className="mt-0.5 text-xs text-text-sec">{invite.studioTagline}</div>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void postInviteAction(invite.id, "accept")}
                disabled={savingId === invite.id}
                size="sm"
                className="rounded-full"
              >
                {savingId === invite.id ? t.accepting : t.accept}
              </Button>
              <Button
                type="button"
                onClick={() => void postInviteAction(invite.id, "reject")}
                disabled={savingId === invite.id}
                variant="secondary"
                size="sm"
                className="rounded-full"
              >
                {savingId === invite.id ? t.rejecting : t.reject}
              </Button>
              <Button asChild variant="ghost" size="sm" className="rounded-full">
                <Link
                  href={providerPublicUrl(
                    { id: invite.studioId, publicUsername: invite.studioPublicUsername },
                    "studio-invite"
                  ) ?? "#"}
                >
                  {t.studioProfile}
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
      {error ? (
        <div role="alert" className="mt-3 rounded-xl border border-danger-border bg-danger-surface p-3 text-sm text-danger-text">
          {error}
        </div>
      ) : null}
    </div>
  );
}
