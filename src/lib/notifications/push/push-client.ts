/**
 * Client-safe browser-push helpers (FIX-EXP-NOTIFICATIONS / EXP-027).
 *
 * NO server imports (no Prisma / VAPID server module) — safe to import from
 * client components (`<PushManager>`, `<PushNotificationsSection>`). All calls
 * are browser-only and guard `typeof window`.
 *
 * EXP-027 contract: permission is requested ONLY from `requestAndSubscribe`,
 * which must be invoked from a user gesture (the push toggle). The mount-time
 * `syncExistingSubscription` NEVER requests permission — it only re-establishes
 * a subscription when permission was already granted. We use
 * `serviceWorker.getRegistration()` (resolves to undefined when no SW is
 * active) instead of `serviceWorker.ready` (which hangs forever in dev, where
 * next-pwa disables the SW).
 */

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

function toApplicationServerKey(vapidPublicKey: string): ArrayBuffer {
  const key = urlBase64ToUint8Array(vapidPublicKey);
  return key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

async function getActiveRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ?? null;
  } catch {
    return null;
  }
}

async function syncSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
  const res = await fetch("/api/notifications/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
  // PUSH-COVERAGE-01: ответ раньше игнорировался — несохранённая подписка
  // давала тумблер «включено» без единого доставленного пуша. Теперь отказ
  // сервера всплывает в `requestAndSubscribe` как "error".
  if (!res.ok) throw new Error(`push subscribe failed: ${res.status}`);
}

export type PushSubscribeResult =
  | "subscribed" // permission granted + subscription synced to server
  | "no-sw" // permission granted, but no active SW (dev) — intent can still persist
  | "denied" // permission denied (or dismissed)
  | "unsupported"
  | "error";

/**
 * Enable flow — MUST be called from a user gesture. Requests permission if
 * needed, subscribes, and syncs the subscription to the server.
 */
export async function requestAndSubscribe(vapidPublicKey: string): Promise<PushSubscribeResult> {
  if (!isPushSupported()) return "unsupported";

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return "denied";

  const registration = await getActiveRegistration();
  // Permission is granted but no SW is active yet (dev / next-pwa disabled, or
  // the SW hasn't registered this load). The caller still persists the intent;
  // `syncExistingSubscription` re-subscribes on the next production load.
  if (!registration) return "no-sw";

  try {
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toApplicationServerKey(vapidPublicKey),
      });
    }
    await syncSubscriptionToServer(sub);
    return "subscribed";
  } catch {
    return "error";
  }
}

/**
 * Mount re-sync — NEVER requests permission. Only (re)subscribes when the user
 * already granted permission, to recover a subscription lost from the DB.
 */
export async function syncExistingSubscription(vapidPublicKey: string): Promise<void> {
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;
  const registration = await getActiveRegistration();
  if (!registration) return;
  try {
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toApplicationServerKey(vapidPublicKey),
      });
    }
    await syncSubscriptionToServer(sub);
  } catch {
    // best-effort
  }
}

/** Disable flow — unsubscribe the browser + drop the server row (best effort). */
export async function unsubscribeBrowserPush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await getActiveRegistration();
  if (!registration) return;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    // ignore — still drop the server row below
  }
  await fetch("/api/notifications/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}
