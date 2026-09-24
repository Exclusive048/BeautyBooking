/**
 * Идемпотентные шаги ПОСЛЕ миграций, на каждом деплое (`npm run deploy:post`,
 * `.github/workflows/deploy.yml` шаг 5/7 (в), тем же worker-образом, что
 * миграции и сид тарифов — в web/api нет tsx и исходников).
 *
 *   1. CROP-PUBLIC-01 — ссылки аватаров на вырез по сохранённой обрезке.
 *   2. BOOTSTRAP-ADMIN-01 — роль администратора аккаунтам из
 *      `BOOTSTRAP_ADMIN_EMAILS` (только с подтверждённым адресом).
 *   3. STUDIO-PORTFOLIO-FEED — строки работ для фото студий, загруженных до
 *      того, как фото студии стали попадать в ленту и истории.
 *   4. STAGED-MASTER-USERNAME — адрес страницы мастерам, вошедшим в студию по
 *      приглашению на заготовку и оставшимся без него.
 *   5. STUDIO-REVIEW-MASTER-RATING — рейтинг мастерам с отзывами о визитах в
 *      студию, оставленными до того, как они стали засчитываться мастеру.
 *
 * Каждый шаг безопасно повторять: второй проход находит ноль строк. Провал =
 * стоп ДО рестарта (деплой не поднимает новую версию), прежняя продолжает работать.
 */
import { PrismaClient } from "@prisma/client";
import { ensureBootstrapAdmins } from "../src/lib/auth/bootstrap-admins";
import { backfillAvatarCropUrls } from "../src/lib/media/avatar-crop-backfill";
import { syncAllStudioPortfolioItemsWith } from "../src/lib/studios/portfolio-items-sync";
import { backfillMissingMasterUsernames } from "../src/lib/publicUsername";
import { backfillStudioReviewMasterRatings } from "../src/lib/reviews/studio-review-master-backfill";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const avatars = await backfillAvatarCropUrls(prisma, { apply: true });
  console.log(`post-deploy · avatar crop urls: updated ${avatars.changed}`);

  const admins = await ensureBootstrapAdmins(prisma);
  console.log(`post-deploy · bootstrap admins: granted ${admins.granted.length}`);

  const studioPortfolio = await syncAllStudioPortfolioItemsWith(prisma);
  console.log(
    `post-deploy · studio portfolio items: created ${studioPortfolio.created}, removed ${studioPortfolio.removed}`,
  );

  const masterUsernames = await backfillMissingMasterUsernames(prisma);
  console.log(`post-deploy · master usernames: assigned ${masterUsernames.assigned}`);

  const studioReviewRatings = await backfillStudioReviewMasterRatings(prisma);
  console.log(`post-deploy · studio review master ratings: recalculated ${studioReviewRatings.masters}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
