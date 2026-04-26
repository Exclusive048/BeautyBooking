"use client";

import { useEffect, useRef } from "react";
import { useMe } from "@/lib/hooks/use-me";

// Converts a VAPID public key (base64url) to Uint8Array required by pushManager.subscribe()
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

async function registerPushSubscription(vapidPublicKey: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;

  // Check if already subscribed — skip if keys still match
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    // Silently re-send to server in case it was lost from DB
    await syncSubscriptionToServer(existing);
    return;
  }

  // Request permission if not yet granted
  if (Notification.permission === "denied") return;

  let permission: NotificationPermission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return;

  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey.buffer.slice(
      applicationServerKey.byteOffset,
      applicationServerKey.byteOffset + applicationServerKey.byteLength
    ) as ArrayBuffer,
  });

  await syncSubscriptionToServer(subscription);
}

async function syncSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

  await fetch("/api/notifications/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
}

export function PushManager() {
  const { user, isLoading } = useMe();
  const attempted = useRef(false);

  useEffect(() => {
    // Only run in production (SW is disabled in dev by next-pwa)
    if (process.env.NODE_ENV !== "production") return;
    // Wait until user data is resolved
    if (isLoading) return;
    // Only subscribe for authenticated users
    if (!user) return;
    // Don't attempt twice in the same session
    if (attempted.current) return;

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) return;
    if (!isPushSupported()) return;

    attempted.current = true;

    registerPushSubscription(vapidPublicKey).catch(() => {
      // Silent fail — push is a best-effort channel
    });
  }, [user, isLoading]);

  return null;
}
