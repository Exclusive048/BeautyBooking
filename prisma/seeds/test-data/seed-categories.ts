import { CategoryStatus, type GlobalCategory } from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";

type CategorySpec = {
  slug: string;
  name: string;
  icon: string | null;
  parentSlug: string | null;
  orderIndex: number;
};

// Top-level categories drive the CategoryPills row (22a) — the four pills
// `nails / hair / brows / skin` map to these slugs verbatim. Sub-categories
// power deeper filtering and per-service `globalCategoryId` linking.
const SPEC: ReadonlyArray<CategorySpec> = [
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
 * sub-category's `parentId`. Status APPROVED + isSystem true + visibleToAll
 * true is the magic combo that makes them appear in the public catalog
 * filter API and prevents admins from accidentally hiding seed data.
 */
export async function seedCategories(): Promise<GlobalCategory[]> {
  logSeed.section("Categories");

  const slugToId = new Map<string, string>();

  for (const c of SPEC.filter((s) => s.parentSlug === null)) {
    const row = await prisma.globalCategory.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        icon: c.icon,
        orderIndex: c.orderIndex,
        status: CategoryStatus.APPROVED,
        isSystem: true,
        visibleToAll: true,
      },
      create: {
        slug: c.slug,
        name: c.name,
        icon: c.icon,
        orderIndex: c.orderIndex,
        parentId: null,
        status: CategoryStatus.APPROVED,
        isSystem: true,
        visibleToAll: true,
      },
    });
    slugToId.set(row.slug, row.id);
  }

  for (const c of SPEC.filter((s) => s.parentSlug !== null)) {
    const parentId = slugToId.get(c.parentSlug!) ?? null;
    const row = await prisma.globalCategory.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        icon: c.icon,
        orderIndex: c.orderIndex,
        parentId,
        status: CategoryStatus.APPROVED,
        isSystem: true,
        visibleToAll: true,
      },
      create: {
        slug: c.slug,
        name: c.name,
        icon: c.icon,
        orderIndex: c.orderIndex,
        parentId,
        status: CategoryStatus.APPROVED,
        isSystem: true,
        visibleToAll: true,
      },
    });
    slugToId.set(row.slug, row.id);
  }

  const all = await prisma.globalCategory.findMany({
    where: { slug: { in: SPEC.map((s) => s.slug) } },
  });
  logSeed.ok(`${all.length} categories upserted (${SPEC.filter((s) => s.parentSlug === null).length} top-level)`);
  return all;
}
