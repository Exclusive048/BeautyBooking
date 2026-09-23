import { MediaAssetStatus, MediaEntityType, MediaKind, type PrismaClient } from "@prisma/client";
import { buildAvatarDisplayUrl } from "@/lib/media/types";

/**
 * CROP-PUBLIC-01 — `Provider.avatarUrl` → ссылка на вырез по сохранённой
 * области обрезки. Рантайм пишет такую ссылку при загрузке и правке обрезки;
 * этот проход выравнивает аватары, обрезанные ДО изменения.
 *
 * Выборка: кабинеты мастера/студии, у ТЕКУЩЕГО аватара которых (последний
 * READY — тот же выбор, что в `media/service.ts`) есть область, а `avatarUrl`
 * ещё не равен ожидаемому. Ссылку строит та же функция, что рантайм
 * (`buildAvatarDisplayUrl`). Идемпотентен: повторный проход находит ноль строк,
 * поэтому безопасно гонять на каждом деплое (`scripts/post-deploy.ts`).
 */
export async function backfillAvatarCropUrls(
  db: Pick<PrismaClient, "mediaAsset" | "provider">,
  options: { apply: boolean; log?: (line: string) => void },
): Promise<{ changed: number }> {
  const cropped = await db.mediaAsset.findMany({
    where: {
      kind: MediaKind.AVATAR,
      entityType: { in: [MediaEntityType.MASTER, MediaEntityType.STUDIO] },
      deletedAt: null,
      status: MediaAssetStatus.READY,
      cropX: { not: null },
      cropY: { not: null },
      cropWidth: { not: null },
      cropHeight: { not: null },
    },
    select: { id: true, entityId: true, entityType: true, cropX: true, cropY: true, cropWidth: true, cropHeight: true },
  });

  let changed = 0;
  for (const asset of cropped) {
    const current = await db.mediaAsset.findFirst({
      where: {
        entityType: asset.entityType,
        entityId: asset.entityId,
        kind: MediaKind.AVATAR,
        deletedAt: null,
        status: MediaAssetStatus.READY,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (current?.id !== asset.id) continue;

    const provider = await db.provider.findUnique({
      where: { id: asset.entityId },
      select: { id: true, avatarUrl: true },
    });
    const expected = buildAvatarDisplayUrl(asset);
    if (!provider || provider.avatarUrl === expected) continue;

    changed += 1;
    options.log?.(`${provider.id}: ${provider.avatarUrl ?? "null"} -> ${expected}`);
    if (options.apply) {
      await db.provider.update({ where: { id: provider.id }, data: { avatarUrl: expected } });
    }
  }
  return { changed };
}
