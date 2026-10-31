import { prisma } from "@/lib/prisma";
import { normalizeRussianPhone } from "@/lib/phone/russia";

/**
 * MANUAL-BOOKING-CLIENT-LINK (запрос владельца 2026-10-31): ручная запись
 * мастера или студии по телефону клиента сразу получает клиента, если номер
 * ДОКАЗАН его аккаунтом (`phoneVerifiedAt`, инв. #46) И этот человек уже
 * записывался на ту же поверхность (`providerId` — личный профиль мастера либо
 * студия). Иначе клиент, который вошёл в приложение и не выходит, не видел
 * запись до следующего входа по коду.
 *
 * Второе условие — граница приватности, а не оптимизация: без него оператор,
 * вписав чужой номер, узнавал бы, зарегистрирован ли человек (в записи
 * появилось бы имя аккаунта), и получал бы переписку и уведомления к
 * незнакомцу по одному своему слову. Своего клиента оператор и так знает.
 *
 * Новому клиенту запись (`clientUserId = null`) прикрепит ЕГО действие —
 * вход по коду или подтверждение номера через VK / Яндекс
 * (`linkGuestBookingsToUserByPhone`).
 */
export async function resolveVerifiedPhoneOwnerId(
  phone: string | null | undefined,
  surface: { providerId: string },
): Promise<string | null> {
  const normalized = phone ? normalizeRussianPhone(phone) : null;
  if (!normalized) return null;
  const owner = await prisma.userProfile.findUnique({
    where: { phone: normalized },
    select: { id: true, phoneVerifiedAt: true, isDeleted: true },
  });
  if (!owner || owner.isDeleted || owner.phoneVerifiedAt === null) return null;
  const known = await prisma.booking.findFirst({
    where: { providerId: surface.providerId, clientUserId: owner.id },
    select: { id: true },
  });
  return known ? owner.id : null;
}
