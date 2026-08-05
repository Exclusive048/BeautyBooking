import { AccountType, type UserProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { logInfo } from "@/lib/logging/logger";
import { maskPhone } from "@/lib/logging/masking";

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
  // LOGIC-30: канонизация — `normalizeRussianPhone`, та же, которой пользуются
  // `linkGuestBookingsToUserByPhone` и `crm/client-key.ts`. Здесь стоял
  // `normalizePhone` (чистит разделители и дописывает «+», формы не проверяет)
  // с порогом «длина ≥ 8», и это давало не просто слабую валидацию, а
  // РАСХОЖДЕНИЕ КЛЮЧА: гость, набравший «8 999 123-45-67», получал профиль с
  // телефоном `+89991234567`, тогда как склейка и вход ищут `+79991234567`.
  // Такой профиль недостижим НАВСЕГДА — ни OTP-вход его не найдёт (там форма
  // `^\+7\d{10}$`), ни `linkGuestBookingsToUserByPhone` не привяжет брони, а
  // согласие по 152-ФЗ (RKN-FIX-02) осталось бы висеть на аккаунте, до
  // которого человек не может добраться.
  const phone = normalizeRussianPhone(input.phone);
  if (!phone) {
    throw new AppError("Проверьте номер телефона.", 400, "VALIDATION_ERROR");
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
  // SECURITY-EXPOSURE-AUDIT-01 · Y17: mask the phone in logs (the rest of the
  // codebase does — raw PII in prod logs is a 152-ФЗ concern).
  logInfo("guest user auto-created via public booking", {
    userId: created.id,
    phone: maskPhone(phone),
  });
  return { profile: created, wasCreated: true };
}
