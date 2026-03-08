import { CategoryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function listHomeCategories() {
  return prisma.globalCategory.findMany({
    where: {
      status: CategoryStatus.APPROVED,
      isSystem: false,
      NOT: [{ visualSearchSlug: "hot" }],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      usageCount: true,
    },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
  });
}

export async function listHomeTags(categoryId?: string) {
  if (!categoryId) {
    return prisma.tag.findMany({
      where: { isFeatured: true },
      select: { id: true, name: true, slug: true, usageCount: true },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
      take: 20,
    });
  }

  const category = await prisma.globalCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, status: true },
  });
  if (!category || category.status !== CategoryStatus.APPROVED) return [];

  return prisma.tag.findMany({
    where: {
      OR: [
        { relatedCategoryId: categoryId },
        {
          portfolioItems: {
            some: {
              portfolioItem: {
                services: {
                  some: {
                    service: {
                      globalCategoryId: categoryId,
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
    select: { id: true, name: true, slug: true, usageCount: true },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    take: 20,
  });
}
