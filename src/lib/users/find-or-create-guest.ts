import { AccountType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { isGuestClassProfile } from "@/lib/legal/consent";
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
/**
 * SESSION-SELECT-LOGIN-PATHS (2026-10-01): гостевой чекаут читает только то,
 * что нужно ему и четырём вызывающим, а не всю строку профиля (адрес, гео,
 * причины блокировки). Поле вне набора — ошибка `typecheck` у вызывающего.
 */
const GUEST_PROFILE_SELECT = {
  id: true,
  phone: true,
  phoneVerifiedAt: true,
  roles: true,
  displayName: true,
} satisfies Prisma.UserProfileSelect;

export type GuestProfile = Prisma.UserProfileGetPayload<{ select: typeof GUEST_PROFILE_SELECT }>;

export async function findOrCreateGuestUserByPhone(input: {
  phone: string;
  displayName?: string | null;
}): Promise<{ profile: GuestProfile; wasCreated: boolean }> {
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

  const existing = await prisma.userProfile.findUnique({ where: { phone }, select: GUEST_PROFILE_SELECT });
  if (existing) {
    // PHONE-CLAIM-01: строка с номером — это либо ДОКАЗАННЫЙ владелец
    // (phoneVerifiedAt; владелец сам бронирует разлогиненным — задуманное
    // поведение), либо guest-class пассивный профиль (прежний путь), либо
    // кабинетная ЗАЯВКА установившегося аккаунта без доказательства. Прикрепить
    // бронь к заявителю значило бы показать ему чужую историю записей — ровно
    // «guest-booking takeover» из SECURITY-EXPOSURE-AUDIT-01 #2. Заявку при этом
    // НЕ освобождаем — анонимный POST не должен уметь мутировать чужой аккаунт
    // (grief-примитив); бронь уезжает в БЕЗНОМЕРНОЙ пассивный профиль ниже:
    // `Booking.clientPhone` всё равно несёт номер, поэтому CRM-поиск и
    // усыновление при OTP-входе (`linkGuestBookingsToUserByPhone` матчится по
    // брони, не по профилю) работают как прежде.
    const attachable =
      existing.phoneVerifiedAt !== null || (await isGuestClassProfile(existing.id));
    if (attachable) {
      const nextRoles = await ensureClientRoleForUser(existing.id, existing.roles);
      return {
        profile: nextRoles === existing.roles ? existing : { ...existing, roles: nextRoles },
        wasCreated: false,
      };
    }

    const orphanDisplayName = input.displayName?.trim() || null;
    const orphan = await prisma.userProfile.create({
      data: {
        displayName: orphanDisplayName,
        firstName: orphanDisplayName,
        roles: [AccountType.CLIENT],
      },
      select: GUEST_PROFILE_SELECT,
    });
    logInfo("guest user created without phone key — number is claimed by an established account", {
      userId: orphan.id,
      phone: maskPhone(phone),
    });
    return { profile: orphan, wasCreated: true };
  }

  const displayName = input.displayName?.trim() || null;
  const created = await prisma.userProfile.create({
    data: {
      phone,
      displayName,
      firstName: displayName,
      roles: [AccountType.CLIENT],
    },
    select: GUEST_PROFILE_SELECT,
  });
  // SECURITY-EXPOSURE-AUDIT-01 · Y17: mask the phone in logs (the rest of the
  // codebase does — raw PII in prod logs is a 152-ФЗ concern).
  logInfo("guest user auto-created via public booking", {
    userId: created.id,
    phone: maskPhone(phone),
  });
  return { profile: created, wasCreated: true };
}
