"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

const T = UI_TEXT.cabinetMaster.notifications;

type Props = {
  notificationId: string;
  isUnread: boolean;
};

/**
 * Single-card mark-read toggle. We only support marking unread → read;
 * the inverse direction has no backend endpoint and is a rare user need.
 * Read-state cards still show the muted check so the layout doesn't shift
 * when the row transitions.
 */
export function MarkReadButton({ notificationId, isUnread }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const toast = useToast();

  const handleClick = async () => {
    if (!isUnread || busy) return;
    setBusy(true);
    try {
      await fetchJsonWithAuth<unknown>(`/api/notifications/${notificationId}/read`, { method: "POST" });
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(serverMessageOr(error, T.errors.markRead));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="wrapper"
      onClick={handleClick}
      disabled={!isUnread || busy}
      aria-label={T.markRead}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
        isUnread
          ? "text-text-sec hover:bg-bg-input hover:text-text-main"
          : "text-success-text"
      )}
    >
      <Check className="h-3.5 w-3.5" aria-hidden />
    </Button>
  );
}
