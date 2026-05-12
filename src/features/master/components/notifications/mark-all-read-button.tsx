"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.notifications;

/**
 * Header CTA — marks every unread master-context notification as read in
 * one PATCH. Sends `?context=master` so personal events on the same
 * account don't get swept up.
 */
export function MarkAllReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/notifications/read-all?context=master", { method: "POST" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="rounded-lg"
      onClick={handleClick}
      disabled={busy}
    >
      <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
      {T.markAllRead}
    </Button>
  );
}
