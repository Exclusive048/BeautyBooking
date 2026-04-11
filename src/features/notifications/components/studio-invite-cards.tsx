"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { NotificationCenterInviteItem } from "@/lib/notifications/center";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { providerPublicUrl } from "@/lib/public-urls";

type Props = {
  invites: NotificationCenterInviteItem[];
  onChanged?: (items: NotificationCenterInviteItem[]) => void;
  className?: string;
};

export function StudioInviteCards({ invites, onChanged, className }: Props) {
  const t = UI_TEXT.notificationsCenter.invites;
  const tCenter = UI_TEXT.notificationsCenter;
  const [items, setItems] = useState<NotificationCenterInviteItem[]>(invites);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const response = await fetch(`/api/invites/${inviteId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json().catch(() => null)) as ApiResponse<{ inviteId: string }> | null;
      if (!response.ok || !json || !json.ok) {
        const code = json && !json.ok ? String(json.error.code ?? "") : "";
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
        setError(json && !json.ok ? json.error.message : t.actionFailed);
        return;
      }

      removeInviteLocally(inviteId);
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
            className="rounded-[22px] border border-border-subtle/80 bg-bg-card p-4 shadow-card"
          >
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-bg-input">
                {invite.studioAvatarUrl ? (
                  <Image
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
                  {t.titlePrefix} <span className="text-primary">{invite.studioName}</span> {t.titleSuffix}
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
        <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}
