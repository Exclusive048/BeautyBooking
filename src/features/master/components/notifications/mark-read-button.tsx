"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

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

  const handleClick = async () => {
    if (!isUnread || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/notifications/${notificationId}/read`, { method: "POST" });
      startTransition(() => router.refresh());
    } catch {
      // Surface failures via the global toast in a follow-up; for now
      // the user can retry on the next render.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isUnread || busy}
      aria-label={T.markRead}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
        isUnread
          ? "text-text-sec hover:bg-bg-input hover:text-text-main"
          : "text-emerald-600 dark:text-emerald-400"
      )}
    >
      <Check className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
