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
 *   0. STUDIO-MASTER-PROFILES (идёт ПЕРВЫМ) — мастера студий делятся на личный
 *      профиль и профиль в студии (`studios/master-profile-split.ts`). Раньше
 *      выдачи адресов (п. 4): у профиля в студии страницы нет, и шаг адресов
 *      его пропускает. Сбой одного мастера деплой НЕ останавливает — новая
 *      версия работает и с неразделённым мастером, а следующий деплой
 *      подхватит его снова.
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
import {
  reconcileStudioVisitReviewsWith,
  splitAllStudioMastersWith,
} from "../src/lib/studios/master-profile-split";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const studioMasters = await splitAllStudioMastersWith(prisma);
  console.log(
    `post-deploy · studio master profiles: split ${studioMasters.split.length}, failed ${studioMasters.failed.length}`,
  );
  for (const item of studioMasters.failed) {
    console.error(`post-deploy · studio master split failed for ${item.personalId}: ${item.error}`);
  }

  const studioVisitReviews = await reconcileStudioVisitReviewsWith(prisma);
  console.log(
    `post-deploy · studio visit reviews: retargeted ${studioVisitReviews.retargeted}, failed ${studioVisitReviews.failed.length}`,
  );
  for (const item of studioVisitReviews.failed) {
    console.error(`post-deploy · studio visit reviews failed for ${item.studioProfileId}: ${item.error}`);
  }

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
