import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";

/**
 * Мастер, АКТИВНЫЙ в ОПУБЛИКОВАННОЙ студии, отдаёт окошки, даже если своей
 * публичной страницы у него нет.
 *
 * Правило выросло из двух случаев, и оба — про одно:
 *  - STUDIO-PAUSE-SPLIT-01: мастер студии скрыл личную страницу, но в студии
 *    работает — виджет студии должен видеть его окошки;
 *  - STUDIO-MASTER-PROFILES (этап 4): у профиля мастера в студии публичной
 *    страницы нет вовсе (его находят через студию), а окошки ему нужны и
 *    виджету студии, и переносу студийной записи клиентом.
 *
 * Единственное место правила: его зовут `/api/masters/[id]/availability` и
 * `/api/public/providers/[id]/slots`.
 */
export async function isActiveMasterOfPublishedStudio(providerId: string): Promise<boolean> {
  const count = await prisma.provider.count({
    where: {
      id: providerId,
      type: ProviderType.MASTER,
      studioId: { not: null },
      ...STUDIO_ACTIVE_MASTER_WHERE,
      studio: { is: { isPublished: true } },
    },
  });
  return count > 0;
}
