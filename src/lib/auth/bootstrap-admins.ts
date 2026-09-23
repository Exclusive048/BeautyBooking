import { AccountType, type PrismaClient } from "@prisma/client";

/**
 * BOOTSTRAP-ADMIN-01 (решение владельца 2026-09-23) — аккаунты, которые
 * ВСЕГДА администраторы платформы.
 *
 * Держится двумя слоями: миграция данных `20260923140000_bootstrap_admin`
 * выдаёт роль сразу, а шаг деплоя `npm run deploy:post` (`scripts/post-deploy.ts`)
 * повторяет выдачу на КАЖДОМ деплое — поэтому роль вернётся, даже если аккаунт
 * заведён позже миграции или роль сняли.
 *
 * 🔴 Роль получает только аккаунт с ПОДТВЕРЖДЁННЫМ адресом (`emailVerifiedAt`,
 * ставит его лишь успешно введённый код — инв. #41). Вписать адрес в профиль
 * может кто угодно (это заявка), и без этого условия любой, вписавший себе
 * этот адрес, стал бы админом на следующем деплое.
 */
export const BOOTSTRAP_ADMIN_EMAILS: readonly string[] = ["dmitriev_ar@masterryadom.ru"];

export async function ensureBootstrapAdmins(
  db: Pick<PrismaClient, "userProfile">,
): Promise<{ granted: string[] }> {
  const candidates = await db.userProfile.findMany({
    where: {
      email: { in: BOOTSTRAP_ADMIN_EMAILS.map((email) => email.toLowerCase()), mode: "insensitive" },
      emailVerifiedAt: { not: null },
      isDeleted: false,
    },
    select: { id: true, roles: true },
  });

  const granted: string[] = [];
  for (const user of candidates) {
    if (user.roles.includes(AccountType.ADMIN)) continue;
    await db.userProfile.update({
      where: { id: user.id },
      data: { roles: [...user.roles, AccountType.ADMIN] },
    });
    granted.push(user.id);
  }
  return { granted };
}
