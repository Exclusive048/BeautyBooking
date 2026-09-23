import { MembershipStatus, Prisma, StudioRole } from "@prisma/client";
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
export type InviteAccessGrant = "PHONE_OWNER" | "EMAIL_OWNER" | "STUDIO_ADMIN";

/**
 * STUDIO-INVITE-EMAIL-01 — приглашение можно адресовать ПОЧТЕ. Право на него —
 * по тому же принципу, что у телефона, но опора другая: `EMAIL_OWNER` = адрес
 * ПОДТВЕРЖДЁН (`emailVerifiedAt`, ставит только успешно введённый код — инв.
 * #41) и совпадает. В проде почта подтверждается самим входом, поэтому
 * приглашение по почте доходит, а по телефону — нет (SMS-шлюза нет, см. выше).
 * Неподтверждённый адрес в профиле — заявка: чужое приглашение он не открывает,
 * кроме гранта `STUDIO_ADMIN` своей же студии (то же, что у телефона).
 */
export function normalizeInviteEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

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
  userEmail: string | null;
  userEmailVerifiedAt: Date | null;
  invitePhone: string | null;
  inviteEmail: string | null;
  inviteStudioId: string;
  administeredStudioIds?: string[];
}): Promise<InviteAccessGrant | null> {
  let ownerGrant: InviteAccessGrant | null = null;
  let matches = false;

  const inviteEmail = normalizeInviteEmail(input.inviteEmail);
  if (inviteEmail) {
    matches = normalizeInviteEmail(input.userEmail) === inviteEmail;
    if (matches && input.userEmailVerifiedAt) ownerGrant = "EMAIL_OWNER";
  } else if (input.invitePhone) {
    matches = invitePhoneMatchesProfile(input.userPhone, input.invitePhone);
    if (matches && input.userPhoneVerifiedAt) ownerGrant = "PHONE_OWNER";
  }

  if (!matches) return null;
  if (ownerGrant) return ownerGrant;

  const administered =
    input.administeredStudioIds ?? (await listAdministeredStudioIds(input.userId));
  return administered.includes(input.inviteStudioId) ? "STUDIO_ADMIN" : null;
}

/**
 * STUDIO-INVITE-EMAIL-01 — условие выборки ожидающих приглашений, которые
 * пользователь вправе ВИДЕТЬ (бейдж колокольчика и центр уведомлений). Одно
 * место на обе поверхности, те же гранты, что у `resolveInviteAccess`:
 * подтверждённый номер/адрес видит все свои приглашения, неподтверждённый —
 * только приглашения студий, которыми пользователь сам управляет. `null` —
 * смотреть не по чему (нет ни номера, ни адреса).
 */
export async function pendingInvitesVisibleToUserWhere(
  userId: string,
): Promise<Prisma.StudioInviteWhereInput | null> {
  const user = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { phone: true, phoneVerifiedAt: true, email: true, emailVerifiedAt: true },
  });
  if (!user) return null;

  const phone = user.phone ? normalizeRussianPhone(user.phone) : null;
  const email = normalizeInviteEmail(user.email);
  if (!phone && !email) return null;

  const needsAdminScope = (phone && !user.phoneVerifiedAt) || (email && !user.emailVerifiedAt);
  const administered = needsAdminScope ? await listAdministeredStudioIds(userId) : [];

  const branches: Prisma.StudioInviteWhereInput[] = [];
  if (phone) {
    branches.push(
      user.phoneVerifiedAt ? { phone } : { phone, studioId: { in: administered } },
    );
  }
  if (email) {
    branches.push(
      user.emailVerifiedAt ? { email } : { email, studioId: { in: administered } },
    );
  }
  return { status: MembershipStatus.PENDING, OR: branches };
}
