import webpush from "web-push";
import { logInfo } from "@/lib/logging/logger";
import { env, isPushEnabled as _isPushEnabled } from "@/lib/env";

const vapidPublicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const vapidPrivateKey = env.VAPID_PRIVATE_KEY?.trim();
const vapidEmail = env.VAPID_EMAIL?.trim();

export const isPushEnabled = _isPushEnabled;

if (isPushEnabled) {
  webpush.setVapidDetails(
    `mailto:${vapidEmail}`,
    vapidPublicKey!,
    vapidPrivateKey!
  );
} else {
  logInfo("Push notifications disabled: VAPID keys not configured");
}

export { webpush };
