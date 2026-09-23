/**
 * Backfill: `Provider.avatarUrl` → ссылка на вырез по сохранённой области.
 * Логика — `src/lib/media/avatar-crop-backfill.ts`; на каждом деплое её гоняет
 * `scripts/post-deploy.ts` (`npm run deploy:post`). Этот вход — ручной, с
 * dry run по умолчанию.
 *
 * USAGE:
 *   npx tsx scripts/backfill-avatar-crop-urls.ts          # DRY RUN (default)
 *   npx tsx scripts/backfill-avatar-crop-urls.ts --apply  # записать
 */
import { PrismaClient } from "@prisma/client";
import { backfillAvatarCropUrls } from "../src/lib/media/avatar-crop-backfill";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODE: APPLY (writing changes)" : "MODE: DRY RUN (no writes; pass --apply to write)");
  const { changed } = await backfillAvatarCropUrls(prisma, { apply, log: (line) => console.log(line) });
  console.log(changed === 0 ? "Nothing to backfill." : `${apply ? "Updated" : "Would update"} ${changed} provider(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
