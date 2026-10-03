import { CategoryStatus, Prisma, type PrismaClient } from "@prisma/client";

/**
 * Системные категории каталога (SYSTEM-CATEGORIES-01, решение владельца
 * 2026-10-01): фиксированный плоский набор, который есть на ЛЮБОЙ базе, в том
 * числе на пустой сразу после миграций, без ручных шагов.
 *
 * Держится двумя слоями, как BOOTSTRAP-ADMIN-01:
 *   1. миграция данных `20261001124736_system_categories` — набор появляется
 *      уже на `migrate deploy` / `migrate reset`;
 *   2. `ensureSystemCategories` на каждом деплое (`npm run deploy:post`), а
 *      также в `seed:reference` и `seed:test` — категория из набора, которой
 *      в базе нет, создаётся заново.
 *
 * 🔴 Только досоздание (решение владельца): существующие строки — и из набора,
 * и созданные руками — не меняются и не удаляются. Правки админа (название,
 * иконка, родитель, статус) переживают любой деплой. Категория считается
 * существующей, если занят её слаг ИЛИ на верхнем уровне уже есть категория с
 * тем же названием (без учёта регистра, пробелов по краям и «ё»/«е») — дубль
 * ручной категории не заводится.
 *
 * Слаги `manicure`, `pedicure`, `makeup`, `hair` совпадают с прежним справочником
 * (PWA-FIX-01) намеренно: там это категории с тем же названием и смыслом, и к
 * ним уже привязаны услуги. `eyebrows` и `eyelashes` — новые слаги: прежние
 * `brows` («Брови и ресницы») и `lashes` («Наращивание ресниц», подкатегория)
 * значат другое.
 *
 * Названия — как называют услугу (SYSTEM-CATEGORIES-02, запрос владельца
 * 2026-10-03: «Брови» → «Оформление бровей»). Прежнее название категории
 * остаётся в `formerNames`: одноимённая ручная категория верхнего уровня с
 * прежним названием тоже считается этой категорией, и дубль под новым
 * названием рядом с ней не заводится. Уже созданные строки переименовала
 * миграция данных `20261003120000_system_categories_names` — только те, чьё
 * название по-прежнему прежнее (правку админа не перетирает).
 *
 * Модуль без `server-only` и без `@/`-импортов: его зовут скрипты вне рантайма
 * Next (`scripts/post-deploy.ts`, сиды), клиент приходит аргументом.
 *
 * Меняя набор: новая категория — строка здесь (её создаст следующий деплой);
 * миграции данных — снимки на дату и после применения не правятся (rule 16),
 * их строки обязаны оставаться в этом списке (сторож `system-categories.test.ts`).
 * Новое название существующей категории — прежнее в `formerNames` + миграция
 * данных с переименованием по образцу `20261003120000_system_categories_names`.
 */

export type SystemCategory = {
  slug: string;
  name: string;
  icon: string;
  orderIndex: number;
  /** Прежние названия: под ними категория могла остаться в базе. */
  formerNames?: readonly string[];
};

export const SYSTEM_CATEGORIES: readonly SystemCategory[] = [
  { slug: "manicure", name: "Маникюр", icon: "💅", orderIndex: 1 },
  { slug: "pedicure", name: "Педикюр", icon: "🦶", orderIndex: 2 },
  { slug: "makeup", name: "Макияж", icon: "💄", orderIndex: 3 },
  { slug: "eyebrows", name: "Оформление бровей", icon: "🖌️", orderIndex: 4, formerNames: ["Брови"] },
  {
    slug: "eyelashes",
    name: "Наращивание и ламинирование ресниц",
    icon: "👁️",
    orderIndex: 5,
    formerNames: ["Ресницы"],
  },
  { slug: "instant-tan", name: "Моментальный загар", icon: "☀️", orderIndex: 6 },
  { slug: "hairstyle", name: "Причёски и укладки", icon: "💁‍♀️", orderIndex: 7, formerNames: ["Причёски"] },
  { slug: "hair", name: "Парикмахерские услуги", icon: "💇", orderIndex: 8 },
  {
    slug: "depilation",
    name: "Восковая депиляция и шугаринг",
    icon: "🍯",
    orderIndex: 9,
    formerNames: ["Депиляция и шугаринг"],
  },
];

export type ExistingCategory = { slug: string; name: string; parentId: string | null };

/** Сравнение названий: регистр, пробелы по краям и внутри, «ё» = «е». */
export function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

/**
 * Какие категории набора создать: нет слага и на верхнем уровне нет категории
 * ни с нынешним, ни с прежним названием.
 */
export function planSystemCategoryCreates(existing: readonly ExistingCategory[]): SystemCategory[] {
  const slugs = new Set(existing.map((row) => row.slug));
  const topLevelNames = new Set(
    existing.filter((row) => row.parentId === null).map((row) => normalizeCategoryName(row.name)),
  );
  return SYSTEM_CATEGORIES.filter(
    (category) =>
      !slugs.has(category.slug) &&
      ![category.name, ...(category.formerNames ?? [])].some((name) =>
        topLevelNames.has(normalizeCategoryName(name)),
      ),
  );
}

export async function ensureSystemCategories(
  db: Pick<PrismaClient, "globalCategory">,
): Promise<{ created: string[] }> {
  const existing = await db.globalCategory.findMany({
    where: { OR: [{ slug: { in: SYSTEM_CATEGORIES.map((category) => category.slug) } }, { parentId: null }] },
    select: { slug: true, name: true, parentId: true },
  });

  const created: string[] = [];
  for (const category of planSystemCategoryCreates(existing)) {
    try {
      await db.globalCategory.create({
        data: {
          slug: category.slug,
          name: category.name,
          icon: category.icon,
          orderIndex: category.orderIndex,
          parentId: null,
          // APPROVED + visibleToAll — единственная комбинация, которую видит
          // публичный каталог (инв. #23).
          status: CategoryStatus.APPROVED,
          visibleToAll: true,
          isSystem: true,
        },
      });
      created.push(category.slug);
    } catch (error) {
      // Слаг занял параллельный прогон между чтением и записью — категория есть.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  return { created };
}
