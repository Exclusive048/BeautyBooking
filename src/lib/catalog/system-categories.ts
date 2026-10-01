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
 * ним уже привязаны услуги. «Брови» и «Ресницы» — новые слаги: прежние `brows`
 * («Брови и ресницы») и `lashes` («Наращивание ресниц») значат другое.
 *
 * Модуль без `server-only` и без `@/`-импортов: его зовут скрипты вне рантайма
 * Next (`scripts/post-deploy.ts`, сиды), клиент приходит аргументом.
 *
 * Меняя набор: новая категория — строка здесь (её создаст следующий деплой);
 * миграция данных — снимок на дату и после применения не правится (rule 16),
 * её строки обязаны оставаться в этом списке (сторож `system-categories.test.ts`).
 */

export type SystemCategory = {
  slug: string;
  name: string;
  icon: string;
  orderIndex: number;
};

export const SYSTEM_CATEGORIES: readonly SystemCategory[] = [
  { slug: "manicure", name: "Маникюр", icon: "💅", orderIndex: 1 },
  { slug: "pedicure", name: "Педикюр", icon: "🦶", orderIndex: 2 },
  { slug: "makeup", name: "Макияж", icon: "💄", orderIndex: 3 },
  { slug: "eyebrows", name: "Брови", icon: "🖌️", orderIndex: 4 },
  { slug: "eyelashes", name: "Ресницы", icon: "👁️", orderIndex: 5 },
  { slug: "instant-tan", name: "Моментальный загар", icon: "☀️", orderIndex: 6 },
  { slug: "hairstyle", name: "Причёски", icon: "💁‍♀️", orderIndex: 7 },
  { slug: "hair", name: "Парикмахерские услуги", icon: "💇", orderIndex: 8 },
  { slug: "depilation", name: "Депиляция и шугаринг", icon: "🍯", orderIndex: 9 },
];

export type ExistingCategory = { slug: string; name: string; parentId: string | null };

/** Сравнение названий: регистр, пробелы по краям и внутри, «ё» = «е». */
export function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

/** Какие категории набора создать: нет слага и нет одноимённой на верхнем уровне. */
export function planSystemCategoryCreates(existing: readonly ExistingCategory[]): SystemCategory[] {
  const slugs = new Set(existing.map((row) => row.slug));
  const topLevelNames = new Set(
    existing.filter((row) => row.parentId === null).map((row) => normalizeCategoryName(row.name)),
  );
  return SYSTEM_CATEGORIES.filter(
    (category) => !slugs.has(category.slug) && !topLevelNames.has(normalizeCategoryName(category.name)),
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
