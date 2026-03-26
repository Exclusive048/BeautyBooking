import webpush from "web-push";
import { logInfo } from "@/lib/logging/logger";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim();
const vapidEmail = process.env.VAPID_EMAIL?.trim();

export const isPushEnabled = Boolean(vapidPublicKey && vapidPrivateKey && vapidEmail);

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
