import { CategoryStatus, type GlobalCategory } from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { REFERENCE_CATEGORIES } from "../reference/catalog-reference";

/**
 * PWA-FIX-01: перечень категорий переехал в
 * `prisma/seeds/reference/catalog-reference.ts` — его же сеет боевой
 * провижининг (`npm run seed:reference`). Здесь остался только upsert, чтобы
 * фикстуры и прод не разошлись двумя копиями справочника.
 */
const SPEC = REFERENCE_CATEGORIES;

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
