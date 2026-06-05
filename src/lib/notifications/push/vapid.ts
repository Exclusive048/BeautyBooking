import webpush from "web-push";
import { logInfo } from "@/lib/logging/logger";
import { env } from "@/lib/env";
import { isVapidConfigured } from "./vapid-config";

/**
 * VAPID-NON-NULL-FIX (BUCKET-A): trimmed values are the canonical guard.
 *
 * `env.isPushEnabled` (in env.ts) checks raw truthiness of the three keys
 * but doesn't strip whitespace. A whitespace-only value sets that flag to
 * `true` while `.trim()` here yields `""` — and `webpush.setVapidDetails`
 * rejects empty strings at runtime. Previously this hazard was masked by
 * `!` non-null assertions which only check `null/undefined`, not empty
 * strings, so a misconfigured env (e.g. `VAPID_PRIVATE_KEY="  "`) would
 * crash with a cryptic web-push validation error at import time.
 *
 * Fix: derive the local boolean from the trimmed values themselves and
 * drop the assertions entirely so the side-effect runs only when each
 * key is genuinely a non-empty string. The pure predicate lives in
 * `vapid-config.ts` so it can be unit-tested without triggering this
 * module's import-time side-effect.
 */
const vapidPublicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const vapidPrivateKey = env.VAPID_PRIVATE_KEY?.trim();
const vapidEmail = env.VAPID_EMAIL?.trim();

export const isPushEnabled = isVapidConfigured(vapidPublicKey, vapidPrivateKey, vapidEmail);

if (vapidPublicKey && vapidPrivateKey && vapidEmail) {
  webpush.setVapidDetails(
    `mailto:${vapidEmail}`,
    vapidPublicKey,
    vapidPrivateKey
  );
} else {
  logInfo("Push notifications disabled: VAPID keys not configured");
}

export { webpush };
