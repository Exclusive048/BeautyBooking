"use client";

import { useEffect, useState } from "react";
import { BellRing, Check } from "lucide-react";
import { useMe } from "@/lib/hooks/use-me";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type SubscriptionItem = {
  providerId: string;
};

type Props = {
  providerId: string;
  enabled: boolean;
  className?: string;
};

/**
 * Subscribe-to-hot-slots toggle (fix-03).
 *
 * Visual: solid brand-gradient pill when unsubscribed (a CTA — opt-in
 * action master wants the user to take), neutral secondary state when
 * already subscribed (informational confirmation). Theme-aware: the
 * brand gradient softens in dark mode so it doesn't overpower the
 * aurora background. Previously the button used `frost-panel` +
 * `text-white` which was readable on the legacy dark cover-photo
 * hero but invisible on the 32a aurora cream gradient.
 *
 * Functionality is end-to-end:
 *   - POST/DELETE `/api/hot-slots/subscribe` toggles
 *     `HotSlotSubscription`
 *   - `notifyHotSlotSubscribers` in `lib/hot-slots/notifications.ts`
 *     fires when the `smart-price-job` mints a new hot slot for the
 *     provider — push + telegram via existing delivery pipeline.
 */
export function HotSlotsSubscribeButton({ providerId, enabled, className }: Props) {
  const { user } = useMe();
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!user || !enabled) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/hot-slots/subscribe", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | ApiResponse<{ items: SubscriptionItem[] }>
          | null;
        if (!res.ok || !json || !json.ok) return;
        if (!cancelled) {
          const exists = json.data.items.some((item) => item.providerId === providerId);
          setSubscribed(exists);
        }
      } finally {
        if (!cancelled) {
          setInitialized(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, providerId, user]);

  if (!enabled) return null;

  const handleClick = async () => {
    if (!user) {
      const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      window.location.href = `/login?next=${next}`;
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/hot-slots/subscribe", {
        method: subscribed ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ ok: boolean }> | null;
      if (!res.ok || !json || !json.ok) return;
      setSubscribed(!subscribed);
    } finally {
      setInitialized(true);
      setLoading(false);
    }
  };

  const label = subscribed
    ? UI_TEXT.publicProfile.slots.unsubscribeHot
    : UI_TEXT.publicProfile.slots.subscribeHot;
  const isLoadingPostMount = loading && initialized;

  return (
    <Button
      variant={subscribed ? "secondary" : "primary"}
      size="sm"
      onClick={() => void handleClick()}
      disabled={loading}
      className={cn(
        "gap-1.5 rounded-xl",
        subscribed
          ? // Subscribed → neutral confirmation chip
            "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
          : // Unsubscribed → brand-gradient CTA. Softer in dark mode
            // so it doesn't overpower the aurora background.
            "bg-brand-gradient text-white shadow-md hover:opacity-95 dark:from-rose-600/90 dark:to-rose-700/90",
        className,
      )}
    >
      {subscribed ? (
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2} />
      ) : (
        <BellRing className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={1.8} />
      )}
      <span>{isLoadingPostMount ? UI_TEXT.publicProfile.slots.subscribeLoading : label}</span>
    </Button>
  );
}
