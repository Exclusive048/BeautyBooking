/**
 * HOME-FEED-COLLAGE — раскладка ленты главной коллажем: колонки, плитки разной
 * высоты. Чистый модуль (без React и DOM), покрыт тестом.
 *
 * Пропорции плиток — только портрет и квадрат. Размеров фото в данных нет
 * (`PortfolioItem.width/height` не заполняются), поэтому высота плитки
 * задаётся рисунком по ключу группы, а фото вписывается `object-cover`.
 * Альбомных плиток нет намеренно: работы мастеров почти всегда вертикальные, и
 * альбомная рамка срезала бы половину кадра — ровно та жалоба, что была на
 * карточках избранного.
 */

export type CollageRatio = "portrait-tall" | "portrait" | "portrait-soft" | "square";

/** Ширина / высота — для расчёта высоты колонок. */
const RATIO_VALUE: Record<CollageRatio, number> = {
  "portrait-tall": 2 / 3,
  portrait: 3 / 4,
  "portrait-soft": 4 / 5,
  square: 1,
};

/** Колонки и зазоры коллажа — одни на ленту и её скелетон. */
export const COLLAGE_ROW_CLASS = "flex items-start gap-1.5 sm:gap-3 lg:gap-4";
export const COLLAGE_COLUMN_CLASS = "flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-3 lg:gap-4";

/** Классы пропорций — литералами, чтобы их видел Tailwind и `check:dead-classes`. */
export const COLLAGE_RATIO_CLASS: Record<CollageRatio, string> = {
  "portrait-tall": "aspect-[2/3]",
  portrait: "aspect-[3/4]",
  "portrait-soft": "aspect-[4/5]",
  square: "aspect-square",
};

/**
 * Рисунок чередования. Высокие плитки реже квадратных соседей — так коллаж
 * «дышит», как на референсе, и не превращается в ровную сетку.
 */
const RATIO_PATTERN: CollageRatio[] = [
  "portrait",
  "square",
  "portrait-tall",
  "portrait-soft",
  "square",
  "portrait",
  "portrait-soft",
  "portrait-tall",
];

function hashKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Пропорция плитки — детерминирована ключом: после догрузки ленты не меняется. */
export function collageRatioFor(key: string): CollageRatio {
  return RATIO_PATTERN[hashKey(key) % RATIO_PATTERN.length]!;
}

/** Зазор между плитками в долях ширины колонки — для оценки высоты колонок. */
const GAP_FRACTION = 0.05;

/**
 * Раскладка по колонкам: каждая следующая плитка — в самую короткую колонку
 * (при равенстве — в левую). Порядок чтения сохраняется построчно, а не
 * «сверху вниз по первой колонке», как у CSS `columns`.
 *
 * Детерминирована: одинаковое начало списка раскладывается одинаково, поэтому
 * догрузка ленты добавляет плитки снизу и не двигает уже показанные.
 */
export function placeInColumns<T>(
  items: readonly T[],
  columnCount: number,
  ratioOf: (item: T) => CollageRatio,
): Array<Array<{ item: T; index: number }>> {
  const count = Math.max(1, Math.floor(columnCount));
  const columns: Array<Array<{ item: T; index: number }>> = Array.from({ length: count }, () => []);
  const heights: number[] = Array.from({ length: count }, () => 0);

  items.forEach((item, index) => {
    let target = 0;
    for (let column = 1; column < count; column += 1) {
      if (heights[column]! < heights[target]! - 1e-9) target = column;
    }
    columns[target]!.push({ item, index });
    heights[target]! += 1 / RATIO_VALUE[ratioOf(item)] + GAP_FRACTION;
  });

  return columns;
}
