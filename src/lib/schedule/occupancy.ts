import { ProviderType, type Prisma } from "@prisma/client";

/**
 * STUDIO-MASTER-PROFILES (этап 1) — занятость ЧЕЛОВЕКА, а не профиля.
 *
 * Решение владельца 2026-09-27: единица записи — профиль (`Provider`), и у
 * мастера их может быть несколько — личный и профиль в студии, у каждого свои
 * услуги, записи и расписание. Общее у них одно — время человека: занятое в
 * одном профиле недоступно в другом. Пока профиль у мастера был один, это
 * держалось само собой (скоуп конфликта — исполнитель, инв. #11). С двумя
 * профилями то же правило держит этот модуль: набор профилей с общей
 * занятостью — все профили-мастера одного владельца (`ownerUserId`).
 *
 * У профиля без владельца (заготовка студии под приглашение, анонимизированный
 * удалённый кабинет) и у студии набор — он сам: связать их не с чем.
 *
 * ⚠️ Перерывы (`TimeBlock`) сюда НЕ входят. Это часть расписания профиля, а
 * расписания у профилей раздельные (перерыв студии закрывает время в студии,
 * а не личный приём). Их по-прежнему читают по одному профилю
 * (`loadTimeBlockRanges`, `assertNoTimeBlockConflict`).
 *
 * Потребители — все места, где считается «свободно ли время»: проверка
 * пересечений (`buildConflictScopeWhere`), движок окошек, «свободно сегодня»,
 * снимок для фильтра «когда», «ближайшее окошко» на странице, сброс кэша окошек.
 * Полноту держит `occupancy.test.ts` (обход дерева).
 */

type OccupancyDb = {
  provider: Pick<Prisma.TransactionClient["provider"], "findUnique">;
};

/**
 * Профили, чья занятость общая с `providerId` (включая его самого).
 * Порядок стабильный: ключи и логи не зависят от порядка строк в БД.
 */
export async function resolveOccupancyProviderIds(
  db: OccupancyDb,
  providerId: string,
): Promise<string[]> {
  const row = await db.provider.findUnique({
    where: { id: providerId },
    select: {
      type: true,
      owner: {
        select: {
          providers: { where: { type: ProviderType.MASTER }, select: { id: true } },
        },
      },
    },
  });
  if (!row || row.type !== ProviderType.MASTER || !row.owner) return [providerId];
  return normalizeOccupancyIds([providerId, ...row.owner.providers.map((item) => item.id)]);
}

export function normalizeOccupancyIds(providerIds: readonly string[]): string[] {
  return Array.from(new Set(providerIds.filter((id) => id.length > 0))).sort();
}

/**
 * Записи, занимающие время профилей набора: где профиль — исполнитель, и
 * записи без назначенного мастера на самом профиле (форма соло-записи).
 * Та же форма, что была у предиката на один профиль, — только по набору.
 */
export function buildOccupancyBookingWhere(
  providerIds: readonly string[],
): Prisma.BookingWhereInput {
  const ids = normalizeOccupancyIds(providerIds);
  return {
    OR: [
      { masterProviderId: { in: ids } },
      { masterProviderId: null, providerId: { in: ids } },
    ],
  };
}
