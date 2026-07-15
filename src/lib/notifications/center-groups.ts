import type { NotificationType } from "@prisma/client";
import {
  groupForNotificationType,
  type ClientNotificationGroup,
} from "@/lib/client-cabinet/notification-groups";

// NOTIFICATIONS-REDESIGN-01 — semantic grouping for the SHARED `/notifications`
// centre (the global bell's target), which aggregates across every role the
// viewer holds.
//
// It deliberately builds ON TOP of `groupForNotificationType` rather than
// duplicating the enum map: that map is exhaustive (`Record<NotificationType,
// …>`, so the compiler catches a new enum value) and stays the single source of
// truth for the five client-facing groups. It is client-framed though — every
// STUDIO_*/MODEL_*/BILLING_* type collapses into "system", which is right for a
// client's own cabinet but useless for a master or studio admin, who need those
// as first-class categories. So we only ever REFINE the "system" bucket here;
// the other four groups pass through untouched.
//
// Prefix matching mirrors what `center.ts` already does for channels
// (`type.startsWith("STUDIO_")`) — an established convention in this domain.

export type CenterNotificationGroup =
  | ClientNotificationGroup // bookings | reminders | reviews | promo | system
  | "billing"
  | "studio"
  | "models";

/**
 * Groups only offered to a viewer who actually holds a professional role.
 * A pure client can never accumulate these (they're addressed to providers),
 * so the data gate below hides them anyway — this is the belt to that braces,
 * keeping a stale/edge row from advertising a category the role can't act on.
 */
export const PROFESSIONAL_GROUPS: ReadonlySet<CenterNotificationGroup> = new Set([
  "billing",
  "studio",
  "models",
]);

/**
 * The synthetic type `center.ts` injects for pending studio schedule-change
 * requests — it isn't a `NotificationType`, so it's mapped explicitly.
 */
export type CenterNotificationType = NotificationType | "SCHEDULE_REQUEST";

export function centerGroupForType(type: CenterNotificationType): CenterNotificationGroup {
  if (type === "SCHEDULE_REQUEST") return "studio";

  const base = groupForNotificationType(type);
  // Only "system" is refined; bookings/reminders/reviews/promo are already the
  // right answer for every role.
  if (base !== "system") return base;

  if (type.startsWith("BILLING_") || type === "SUBSCRIPTION_GRANTED_BY_ADMIN") return "billing";
  if (type.startsWith("STUDIO_")) return "studio";
  if (type.startsWith("MODEL_")) return "models";
  return "system";
}
