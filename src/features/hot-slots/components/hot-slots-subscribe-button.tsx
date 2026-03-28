"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/hooks/use-me";
import { Button } from "@/components/ui/button";
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

  const label = subscribed ? UI_TEXT.publicProfile.slots.unsubscribeHot : UI_TEXT.publicProfile.slots.subscribeHot;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void handleClick()}
      disabled={loading}
      className={`frost-panel rounded-xl px-3 text-white hover:bg-black/55 ${className ?? ""}`}
    >
      {loading && initialized ? UI_TEXT.publicProfile.slots.subscribeLoading : label}
    </Button>
  );
}
