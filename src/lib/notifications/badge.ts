import { MembershipStatus } from "@prisma/client";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";
import type { NotificationContext } from "@/lib/notifications/groups";
import { getUnreadCount } from "@/lib/notifications/service";

/**
 * Aggregates the unread badge for the global navbar bell, the master
 * sidebar, and any future surface that needs a "do I have something?" hint.
 *
 * `context` (26-NOTIF-A) splits the count between cabinets:
 *   - `master` — only operational events for a master (no studio invites,
 *     billing, or client-side notifications). Slight over-count is
 *     possible for ambiguous types like `BOOKING_REMINDER_24H`; the
 *     master notifications page applies precise per-notification
 *     classification when displaying.
 *   - `personal` — the complement: studio invites + everything not in
 *     `MASTER_NOTIFICATION_TYPES` (billing, security, client bookings).
 *   - `all` (default) — legacy behaviour: every unread + studio invites.
 *     Kept for callers that haven't been migrated yet.
 */
export async function getUnreadBadgeCount(input: {
  userId: string;
  phone: string | null;
  context?: NotificationContext;
}): Promise<{ count: number; hasUnread: boolean }> {
  const context = input.context ?? "all";
  const normalizedPhone = input.phone ? normalizeRussianPhone(input.phone) : null;

  // Studio invites belong to the personal stream — they are user-level
  // events that have nothing to do with master operations. Master badge
  // suppresses them; personal/all surfaces include them.
  const includeInvites = context !== "master";

  const [unreadCount, inviteCount] = await Promise.all([
    getUnreadCount(input.userId, context === "all" ? undefined : context),
    includeInvites && normalizedPhone
      ? prisma.studioInvite.count({
          where: { phone: normalizedPhone, status: MembershipStatus.PENDING },
        })
      : Promise.resolve(0),
  ]);

  const count = unreadCount + inviteCount;
  return { count, hasUnread: count > 0 };
}
