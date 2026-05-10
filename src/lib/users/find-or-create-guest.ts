import { AccountType, type UserProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/auth/otp";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { logInfo } from "@/lib/logging/logger";

/**
 * Phone-first guest user lookup/create for public booking (32b).
 *
 * Public booking flow runs without OTP verification (no SMS gateway in
 * MVP). To still attribute the booking to a `UserProfile` we either:
 *   - reuse an existing profile keyed by normalized phone, OR
 *   - create a passive `CLIENT` profile that gets activated when the
 *     person later logs in via OTP (linkGuestBookingsToUserByPhone
 *     stitches the records).
 *
 * The caller is responsible for rate-limiting; without that this is a
 * spam vector. See BACKLOG → "SMS verification pre-launch blocker".
 *
 * Returns the profile + a `wasCreated` flag so callers can log/route
 * differently on first-time guests.
 */
export async function findOrCreateGuestUserByPhone(input: {
  phone: string;
  displayName?: string | null;
}): Promise<{ profile: UserProfile; wasCreated: boolean }> {
  const phone = normalizePhone(input.phone.trim());
  if (!phone || phone.length < 8) {
    throw new Error("Invalid phone for guest user creation");
  }

  const existing = await prisma.userProfile.findUnique({ where: { phone } });
  if (existing) {
    const nextRoles = await ensureClientRoleForUser(existing.id, existing.roles);
    return {
      profile: nextRoles === existing.roles ? existing : { ...existing, roles: nextRoles },
      wasCreated: false,
    };
  }

  const displayName = input.displayName?.trim() || null;
  const created = await prisma.userProfile.create({
    data: {
      phone,
      displayName,
      firstName: displayName,
      roles: [AccountType.CLIENT],
    },
  });
  logInfo("guest user auto-created via public booking", {
    userId: created.id,
    phone,
  });
  return { profile: created, wasCreated: true };
}
