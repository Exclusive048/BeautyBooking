import { CategoryStatus, type GlobalCategory } from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { ensureSystemCategories } from "../../../src/lib/catalog/system-categories";

type FixtureCategory = {
  slug: string;
  name: string;
  icon: string | null;
  parentSlug: string | null;
  orderIndex: number;
};

/**
 * Категории ФИКСТУР: двухуровневый справочник PWA-FIX-01. На эти слаги
 * опираются услуги и специализации тестовых провайдеров
 * (`seed-showcase-studio.ts`: `haircut`, `coloring`, `browarchitect`, `skin`,
 * `massage`…), поэтому они остаются здесь.
 *
 * Боевой набор — другой: фиксированные плоские категории
 * `src/lib/catalog/system-categories.ts` (SYSTEM-CATEGORIES-01). Они приходят
 * миграцией данных, а сид после фикстур досоздаёт недостающие — так dev-база
 * содержит и то, и другое. Слаги `manicure`, `pedicure`, `makeup`, `hair` общие:
 * фикстура пишет их своим `upsert` (в dev «Маникюр» — подкатегория «Маникюра и
 * педикюра»), набор их уже не создаёт.
 */
const FIXTURE_CATEGORIES: ReadonlyArray<FixtureCategory> = [
  { slug: "nails", name: "Маникюр и педикюр", icon: "💅", parentSlug: null, orderIndex: 1 },
  { slug: "hair", name: "Парикмахерские услуги", icon: "💇", parentSlug: null, orderIndex: 2 },
  { slug: "brows", name: "Брови и ресницы", icon: "👁️", parentSlug: null, orderIndex: 3 },
  { slug: "skin", name: "Косметология и уход", icon: "✨", parentSlug: null, orderIndex: 4 },
  { slug: "massage", name: "Массаж и СПА", icon: "💆", parentSlug: null, orderIndex: 5 },
  { slug: "makeup", name: "Макияж", icon: "💄", parentSlug: null, orderIndex: 6 },

  { slug: "manicure", name: "Маникюр", icon: null, parentSlug: "nails", orderIndex: 1 },
  { slug: "pedicure", name: "Педикюр", icon: null, parentSlug: "nails", orderIndex: 2 },
  { slug: "haircut", name: "Стрижка", icon: null, parentSlug: "hair", orderIndex: 1 },
  { slug: "coloring", name: "Окрашивание", icon: null, parentSlug: "hair", orderIndex: 2 },
  { slug: "lashes", name: "Наращивание ресниц", icon: null, parentSlug: "brows", orderIndex: 1 },
  { slug: "browarchitect", name: "Оформление бровей", icon: null, parentSlug: "brows", orderIndex: 2 },
];

/**
 * Upsert categories in two passes: top-level first so we can resolve each
 * sub-category's `parentId`. Status APPROVED + visibleToAll true is the combo
 * that makes them appear in the public catalog filter API (инв. #23).
 */
export async function seedCategories(): Promise<GlobalCategory[]> {
  logSeed.section("Categories");

  const slugToId = new Map<string, string>();

  for (const pass of [null, "child"] as const) {
    const batch = FIXTURE_CATEGORIES.filter((c) =>
      pass === null ? c.parentSlug === null : c.parentSlug !== null,
    );
    for (const c of batch) {
      const fields = {
        name: c.name,
        icon: c.icon,
        orderIndex: c.orderIndex,
        parentId: c.parentSlug ? (slugToId.get(c.parentSlug) ?? null) : null,
        status: CategoryStatus.APPROVED,
        isSystem: true,
        visibleToAll: true,
      };
      const row = await prisma.globalCategory.upsert({
        where: { slug: c.slug },
        update: fields,
        create: { slug: c.slug, ...fields },
      });
      slugToId.set(row.slug, row.id);
    }
  }

  const system = await ensureSystemCategories(prisma);

  const all = await prisma.globalCategory.findMany({
    where: { slug: { in: FIXTURE_CATEGORIES.map((s) => s.slug) } },
  });
  logSeed.ok(
    `${all.length} fixture categories upserted (${FIXTURE_CATEGORIES.filter((s) => s.parentSlug === null).length} top-level); ` +
      `system set: created ${system.created.length}`,
  );
  return all;
}
