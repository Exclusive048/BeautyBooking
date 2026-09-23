/**
 * CATALOG-CARD-CAROUSEL — фото, которые листает карточка выдачи (каталог и
 * поиск по времени собирают их одинаково).
 *
 * Группы передаются по приоритету: у мастера — его портфолио в порядке показа
 * (главное фото первым, `lib/master/portfolio-order.ts`); у студии — её
 * портфолио (главное первым, `lib/studios/catalog-cover.ts`), а затем работы
 * её мастеров добором.
 */
export const CARD_PHOTO_LIMIT = 8;

export function composeCardPhotos(...groups: ReadonlyArray<readonly string[]>): string[] {
  const photos: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const url of group) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      photos.push(url);
      if (photos.length >= CARD_PHOTO_LIMIT) return photos;
    }
  }
  return photos;
}
