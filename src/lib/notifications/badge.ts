import { MembershipStatus } from "@prisma/client";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";
import { getUnreadCount } from "@/lib/notifications/service";

export async function getUnreadBadgeCount(input: {
  userId: string;
  phone: string | null;
}): Promise<{ count: number; hasUnread: boolean }> {
  const normalizedPhone = input.phone ? normalizeRussianPhone(input.phone) : null;
  const [unreadCount, inviteCount] = await Promise.all([
    getUnreadCount(input.userId),
    normalizedPhone
      ? prisma.studioInvite.count({
          where: { phone: normalizedPhone, status: MembershipStatus.PENDING },
        })
      : Promise.resolve(0),
  ]);

  const count = unreadCount + inviteCount;
  return { count, hasUnread: count > 0 };
}
