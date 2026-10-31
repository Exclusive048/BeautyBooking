import { prisma } from "@/lib/prisma";
import { normalizeRussianPhone } from "@/lib/phone/russia";

/**
 * MANUAL-BOOKING-CLIENT-LINK (запрос владельца 2026-10-31): ручная запись
 * мастера или студии по телефону клиента принадлежит клиенту, если номер
 * ДОКАЗАН его аккаунтом (`phoneVerifiedAt`, инв. #46: только доказанный номер
 * работает ключом). Раньше ручная запись всегда рождалась без клиента и
 * доезжала до аккаунта лишь при следующем входе по коду — клиент, который уже
 * вошёл в приложение и не выходит, её не видел.
 *
 * Непроверенная заявка номера и пассивный гостевой профиль записи не получают:
 * такую запись (`clientUserId = null`) прикрепит вход по коду или
 * подтверждение номера через VK / Яндекс (`linkGuestBookingsToUserByPhone`).
 */
export async function resolveVerifiedPhoneOwnerId(phone: string | null | undefined): Promise<string | null> {
  const normalized = phone ? normalizeRussianPhone(phone) : null;
  if (!normalized) return null;
  const owner = await prisma.userProfile.findUnique({
    where: { phone: normalized },
    select: { id: true, phoneVerifiedAt: true, isDeleted: true },
  });
  if (!owner || owner.isDeleted || owner.phoneVerifiedAt === null) return null;
  return owner.id;
}
