"use client";

import { useEffect, useRef } from "react";
import { useMe } from "@/lib/hooks/use-me";
import { env, isProduction } from "@/lib/env";
import { syncExistingSubscription } from "@/lib/notifications/push/push-client";

/**
 * FIX-EXP-NOTIFICATIONS (EXP-027): push permission is NEVER requested on load.
 * The old behaviour called `Notification.requestPermission()` from this mount
 * effect (no user gesture) — browsers throttle/penalise that and it surprised
 * users. The permission request now lives behind the explicit push toggle
 * (`<PushNotificationsSection>`), a real user gesture.
 *
 * This component only RE-ESTABLISHES a subscription that was already authorised:
 * runs in production, for authenticated users who opted in
 * (`pushNotificationsEnabled`) AND already granted permission — so it never
 * prompts. If the user hasn't opted in or hasn't granted permission, it does
 * nothing and waits for the toggle.
 */
export function PushManager() {
  const { user, isLoading } = useMe();
  const attempted = useRef(false);

  useEffect(() => {
    // Only run in production (SW is disabled in dev by next-pwa).
    if (!isProduction) return;
    if (isLoading) return;
    if (!user) return;
    // Opt-in gate: never touch push for users who didn't enable it.
    if (!user.pushNotificationsEnabled) return;
    if (attempted.current) return;

    const vapidPublicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) return;

    attempted.current = true;

    // Re-sync only — NO permission request (it bails unless already granted).
    void syncExistingSubscription(vapidPublicKey);
  }, [user, isLoading]);

  return null;
}
