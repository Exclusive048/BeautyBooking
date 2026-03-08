import { CategoryStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SLUG_TO_TITLE: Record<string, { title: string; parentTitle?: string; slugBase?: string }> = {
  manicure: { title: "Маникюр", parentTitle: "Ногти", slugBase: "manicure" },
  pedicure: { title: "Педикюр", parentTitle: "Ногти", slugBase: "pedicure" },
  lashes: { title: "Ресницы", slugBase: "lashes" },
  brows: { title: "Брови", slugBase: "brows" },
  makeup: { title: "Макияж", slugBase: "makeup" },
  hairstyle: { title: "Причёски", slugBase: "hairstyle" },
};

const PARENT_SLUG_BASE: Record<string, string> = {
  "Ногти": "nogti",
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root =
    base
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "category";
  let candidate = root;
  let suffix = 2;

  while (true) {
    const existing = await prisma.globalCategory.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing || (excludeId && existing.id === excludeId)) {
      return candidate;
    }

    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
}

async function ensureParent(title: string): Promise<{ id: string }> {
  const existing = await prisma.globalCategory.findFirst({
    where: { name: title, parentId: null },
    select: { id: true, slug: true },
    orderBy: { createdAt: "asc" },
  });

  const slugBase = PARENT_SLUG_BASE[title] ?? `parent-${normalize(title)}`;

  if (existing) {
    const nextSlug = await ensureUniqueSlug(slugBase, existing.id);
    await prisma.globalCategory.update({
      where: { id: existing.id },
      data: {
        slug: nextSlug,
        status: CategoryStatus.APPROVED,
        reviewedAt: new Date(),
        proposedBy: null,
        proposedAt: null,
        isSystem: false,
      },
    });
    return { id: existing.id };
  }

  const slug = await ensureUniqueSlug(slugBase);
  const created = await prisma.globalCategory.create({
    data: {
      name: title,
      slug,
      status: CategoryStatus.APPROVED,
      reviewedAt: new Date(),
      proposedBy: null,
      proposedAt: null,
      isSystem: false,
      orderIndex: 0,
      parentId: null,
    },
    select: { id: true },
  });

  return created;
}

async function upsertVisualCategory(input: {
  visualSlug: string;
  title: string;
  parentId: string | null;
  slugBase: string;
}): Promise<void> {
  const existing = await prisma.globalCategory.findFirst({
    where: {
      OR: [
        { visualSearchSlug: input.visualSlug },
        {
          name: input.title,
          parentId: input.parentId,
        },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    const nextSlug = await ensureUniqueSlug(input.slugBase, existing.id);
    await prisma.globalCategory.update({
      where: { id: existing.id },
      data: {
        name: input.title,
        slug: nextSlug,
        parentId: input.parentId,
        visualSearchSlug: input.visualSlug,
        status: CategoryStatus.APPROVED,
        reviewedAt: new Date(),
        proposedBy: null,
        proposedAt: null,
        isSystem: false,
      },
    });
    return;
  }

  const slug = await ensureUniqueSlug(input.slugBase);
  await prisma.globalCategory.create({
    data: {
      name: input.title,
      slug,
      parentId: input.parentId,
      visualSearchSlug: input.visualSlug,
      status: CategoryStatus.APPROVED,
      reviewedAt: new Date(),
      proposedBy: null,
      proposedAt: null,
      isSystem: false,
      orderIndex: 0,
    },
  });
}

async function main() {
  for (const [visualSlug, meta] of Object.entries(SLUG_TO_TITLE)) {
    let parentId: string | null = null;
    if (meta.parentTitle) {
      const parent = await ensureParent(meta.parentTitle);
      parentId = parent.id;
    }

    await upsertVisualCategory({
      visualSlug,
      title: meta.title,
      parentId,
      slugBase: meta.slugBase ?? visualSlug,
    });
  }

  console.log("Visual search categories seeded.");
}

main()
  .catch((error) => {
    console.error("Failed to seed visual search categories", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });