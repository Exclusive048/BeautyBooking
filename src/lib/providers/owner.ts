import { prisma } from "@/lib/prisma";

/**
 * Владеет ли пользователь этим профилем (`Provider.ownerUserId`). Проверка
 * «зритель — хозяин страницы» для публичных поверхностей: веб прячет запись
 * владельцу (`isViewerProfileOwner`, FIX-MASTER-01 item 5), JSON-обзор
 * провайдера отдаёт флаг `viewer.isOwner` (MOBILE-B3).
 *
 * Прямой запрос намеренно: публичный DTO `ownerUserId` не несёт (инв. #29 —
 * внутренние id не покидают публичные API), поэтому владение решается только
 * на сервере.
 */
export async function isProviderOwner(providerId: string, userId: string): Promise<boolean> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { ownerUserId: true },
  });
  return provider?.ownerUserId === userId;
}
