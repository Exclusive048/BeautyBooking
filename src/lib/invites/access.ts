import { MembershipStatus, StudioRole } from "@prisma/client";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";

/**
 * FIX-STUDIO-SELF-INVITE — кто имеет право на приглашение студии.
 *
 * 🔴 Контекст (инв. #46, PHONE-CLAIM-01). Приглашение адресовано ТЕЛЕФОНУ, и
 * единственным ключом доступа к нему было доказанное владение номером
 * (`phoneVerifiedAt != null`). Это правильная защита от «invite takeover»:
 * иначе кто угодно вписывал бы чужой номер себе в кабинет и принимал чужие
 * приглашения. Ослаблять её нельзя.
 *
 * Но у неё есть следствие, которое до включения SMS-шлюза гасит флоу целиком:
 * подтверждённых номеров в проде НЕТ НИ У КОГО (отметку ставит только
 * phone-OTP, а он включается наличием SMS-кредов — §7). Значит владелец
 * студии, вписавший в приглашение СВОЙ номер, не получал ни уведомления, ни
 * бейджа, ни возможности нажать «Принять»: приглашение создавалось и повисало.
 *
 * Второй грант закрывает ровно этот случай и НЕ ослабляет первый, потому что
 * опирается не на телефон, а на членство, доказанное сервером:
 *
 *   PHONE_OWNER  — номер подтверждён OTP и совпадает с номером приглашения.
 *   STUDIO_ADMIN — пользователь АДМИНИСТРИРУЕТ ту самую студию, которая
 *                  выписала приглашение, И номер приглашения совпадает с
 *                  номером в его собственном профиле (пусть и незаявленным).
 *
 * Почему второй конъюнкт обязателен: без него администратор мог бы «принять»
 * приглашение, выписанное на телефон постороннего мастера, — не перехват
 * аккаунта, но тихое сжигание чужого приглашения и seat'а. С ним грант покрывает
 * ровно «я пригласил сам себя»: номер уже стоит в моём профиле, я же его и
 * вписал в приглашение.
 *
 * Чужую заявку это не легализует: номер сравнивается с ЗАПИСАННЫМ в профиле, а
 * не с введённым в форме, и грант действует только внутри своей студии.
 */
export type InviteAccessGrant = "PHONE_OWNER" | "STUDIO_ADMIN";

const ADMIN_ROLES: StudioRole[] = [StudioRole.OWNER, StudioRole.ADMIN];

/** Студии, которыми пользователь управляет (владелец провайдера/студии или ADMIN). */
export async function listAdministeredStudioIds(userId: string): Promise<string[]> {
  const studios = await prisma.studio.findMany({
    where: {
      OR: [
        { ownerUserId: userId },
        { provider: { ownerUserId: userId } },
        {
          memberships: {
            some: {
              userId,
              status: MembershipStatus.ACTIVE,
              roles: { hasSome: ADMIN_ROLES },
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  return studios.map((studio) => studio.id);
}

/** Совпадает ли номер приглашения с номером, записанным в профиле пользователя. */
export function invitePhoneMatchesProfile(
  userPhone: string | null | undefined,
  invitePhone: string,
): boolean {
  if (!userPhone) return false;
  const normalizedUserPhone = normalizeRussianPhone(userPhone);
  const normalizedInvitePhone = normalizeRussianPhone(invitePhone);
  if (!normalizedUserPhone || !normalizedInvitePhone) return false;
  return normalizedUserPhone === normalizedInvitePhone;
}

/**
 * Итоговое право на приглашение: `null` — прав нет.
 *
 * `administeredStudioIds` передаётся, когда вызывающий уже посчитал список
 * (списковые поверхности считают его один раз на запрос); иначе резолвится тут.
 */
export async function resolveInviteAccess(input: {
  userId: string;
  userPhone: string | null;
  userPhoneVerifiedAt: Date | null;
  invitePhone: string;
  inviteStudioId: string;
  administeredStudioIds?: string[];
}): Promise<InviteAccessGrant | null> {
  const phoneMatches = invitePhoneMatchesProfile(input.userPhone, input.invitePhone);
  if (!phoneMatches) return null;

  if (input.userPhoneVerifiedAt) return "PHONE_OWNER";

  const administered =
    input.administeredStudioIds ?? (await listAdministeredStudioIds(input.userId));
  return administered.includes(input.inviteStudioId) ? "STUDIO_ADMIN" : null;
}
