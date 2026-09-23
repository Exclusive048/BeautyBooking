/**
 * Идемпотентные шаги ПОСЛЕ миграций, на каждом деплое (`npm run deploy:post`,
 * `.github/workflows/deploy.yml` шаг 5/7 (в), тем же worker-образом, что
 * миграции и сид тарифов — в web/api нет tsx и исходников).
 *
 *   1. CROP-PUBLIC-01 — ссылки аватаров на вырез по сохранённой обрезке.
 *   2. BOOTSTRAP-ADMIN-01 — роль администратора аккаунтам из
 *      `BOOTSTRAP_ADMIN_EMAILS` (только с подтверждённым адресом).
 *
 * Каждый шаг безопасно повторять: второй проход находит ноль строк. Провал =
 * стоп ДО рестарта (деплой не поднимает новую версию), прежняя продолжает работать.
 */
import { PrismaClient } from "@prisma/client";
import { ensureBootstrapAdmins } from "../src/lib/auth/bootstrap-admins";
import { backfillAvatarCropUrls } from "../src/lib/media/avatar-crop-backfill";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const avatars = await backfillAvatarCropUrls(prisma, { apply: true });
  console.log(`post-deploy · avatar crop urls: updated ${avatars.changed}`);

  const admins = await ensureBootstrapAdmins(prisma);
  console.log(`post-deploy · bootstrap admins: granted ${admins.granted.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
