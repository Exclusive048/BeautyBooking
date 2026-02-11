import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const HOT_CATEGORY = {
  slug: "hot",
  name: "Горящие",
  icon: "🔥",
};

async function ensureHotCategory() {
  const existing = await prisma.globalCategory.findUnique({
    where: { slug: HOT_CATEGORY.slug },
  });
  if (existing) {
    if (!existing.isActive) {
      return prisma.globalCategory.update({
        where: { id: existing.id },
        data: { isActive: true, isValidated: true, isRejected: false },
      });
    }
    return existing;
  }

  try {
    return await prisma.globalCategory.create({
      data: {
        name: HOT_CATEGORY.name,
        slug: HOT_CATEGORY.slug,
        icon: HOT_CATEGORY.icon,
        isActive: true,
        isValidated: true,
        isRejected: false,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const retry = await prisma.globalCategory.findUnique({
        where: { slug: HOT_CATEGORY.slug },
      });
      if (retry) return retry;
    }
    throw error;
  }
}

export async function listHomeCategories() {
  await ensureHotCategory();
  return prisma.globalCategory.findMany({
    where: { isActive: true },
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
    select: { id: true },
  });
  if (!category) return [];

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
