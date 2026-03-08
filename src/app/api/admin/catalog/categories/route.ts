import { CategoryStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { slugifyCategory } from "@/lib/slug";
import { sortCategoriesHierarchically } from "@/lib/catalog/category-sort";

const MAX_SLUG_LENGTH = 60;
const MAX_CATEGORY_DEPTH = 3;

const createSchema = z.object({
  title: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  icon: z.string().trim().max(10).optional().nullable(),
  parentId: z.string().trim().min(1).optional().nullable(),
});

function normalizeOptional(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function wouldCreateCycle(categoryId: string | null, newParentId: string): Promise<boolean> {
  let current: string | null = newParentId;
  let depth = 0;

  while (current !== null) {
    if (categoryId && current === categoryId) return true;
    depth += 1;
    if (depth > MAX_CATEGORY_DEPTH) return true;

    const parentRecord: { parentId: string | null } | null = await prisma.globalCategory.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    current = parentRecord?.parentId ?? null;
  }

  return false;
}

async function ensureUniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.globalCategory.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    const suffixLabel = `-${suffix}`;
    const trimmed = base.slice(0, Math.max(0, MAX_SLUG_LENGTH - suffixLabel.length));
    candidate = `${trimmed}${suffixLabel}`;
    suffix += 1;
  }
}

function parseStatus(value: string | null): CategoryStatus | null {
  if (value === CategoryStatus.PENDING) return CategoryStatus.PENDING;
  if (value === CategoryStatus.APPROVED) return CategoryStatus.APPROVED;
  if (value === CategoryStatus.REJECTED) return CategoryStatus.REJECTED;
  return null;
}

function statusOrder(status: CategoryStatus): number {
  if (status === CategoryStatus.PENDING) return 0;
  if (status === CategoryStatus.APPROVED) return 1;
  return 2;
}

export async function GET(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const statusParam = parseStatus(url.searchParams.get("status"));
    const tab = url.searchParams.get("tab")?.toLowerCase() ?? null;

    const where: Prisma.GlobalCategoryWhereInput = {};
    if (statusParam) {
      where.status = statusParam;
    } else if (tab === "moderation") {
      where.status = CategoryStatus.PENDING;
    }

    const rows = await prisma.globalCategory.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        parentId: true,
        orderIndex: true,
        status: true,
        proposedBy: true,
        proposedAt: true,
        context: true,
        reviewedAt: true,
        isSystem: true,
        visualSearchSlug: true,
        usageCount: true,
        createdByUserId: true,
        createdByProviderId: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, displayName: true, phone: true, email: true },
        },
      },
    });

    const creatorById = new Map(rows.map((row) => [row.id, row.createdBy]));
    const sortableCategories = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      icon: row.icon,
      parentId: row.parentId,
      orderIndex: row.orderIndex,
      status: row.status,
      proposedBy: row.proposedBy,
      proposedAt: row.proposedAt,
      context: row.context,
      reviewedAt: row.reviewedAt,
      isSystem: row.isSystem,
      visualSearchSlug: row.visualSearchSlug,
      usageCount: row.usageCount,
      createdByUserId: row.createdByUserId,
      createdByProviderId: row.createdByProviderId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
    const hierarchySorted = sortCategoriesHierarchically(sortableCategories);
    const hierarchyOrder = new Map(hierarchySorted.map((category, index) => [category.id, index]));

    const sorted = [...hierarchySorted].sort((left, right) => {
      const byStatus = statusOrder(left.status) - statusOrder(right.status);
      if (byStatus !== 0) return byStatus;
      return (hierarchyOrder.get(left.id) ?? 0) - (hierarchyOrder.get(right.id) ?? 0);
    });

    return ok({
      categories: sorted.map((category) => ({
        id: category.id,
        title: category.name,
        slug: category.slug,
        icon: category.icon,
        parentId: category.parentId,
        depth: category.depth,
        fullPath: category.fullPath,
        status: category.status,
        proposedBy: category.proposedBy,
        proposedAt: category.proposedAt?.toISOString() ?? null,
        context: category.context,
        reviewedAt: category.reviewedAt?.toISOString() ?? null,
        isSystem: category.isSystem,
        visualSearchSlug: category.visualSearchSlug,
        usageCount: category.usageCount,
        createdAt: category.createdAt.toISOString(),
        createdBy: creatorById.get(category.id) ?? null,
      })),
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const title = parsed.data.title.trim();
    const icon = normalizeOptional(parsed.data.icon ?? null);
    const parentId = normalizeOptional(parsed.data.parentId ?? null);
    const rawSlug = normalizeOptional(parsed.data.slug ?? null);
    const normalizedSlug = rawSlug ? rawSlug.toLowerCase() : null;
    const generated = normalizedSlug ?? slugifyCategory(title, MAX_SLUG_LENGTH);

    if (!generated || generated.length < 2) {
      return fail("Не удалось сформировать slug, укажите его вручную.", 400, "VALIDATION_ERROR");
    }

    if (normalizedSlug) {
      const existing = await prisma.globalCategory.findUnique({
        where: { slug: normalizedSlug },
        select: { id: true },
      });
      if (existing) {
        return fail("Slug уже занят другой категорией.", 409, "ALREADY_EXISTS");
      }
    }

    if (parentId) {
      const parent = await prisma.globalCategory.findUnique({
        where: { id: parentId },
        select: { id: true },
      });
      if (!parent) {
        return fail("Родительская категория не найдена.", 404, "NOT_FOUND");
      }
      const hasCycle = await wouldCreateCycle(null, parentId);
      if (hasCycle) {
        return fail("Circular category reference", 400, "BAD_REQUEST");
      }
    }

    const uniqueSlug = normalizedSlug ? normalizedSlug : await ensureUniqueSlug(generated);
    const created = await prisma.globalCategory.create({
      data: {
        name: title,
        slug: uniqueSlug,
        icon,
        parentId,
        status: CategoryStatus.APPROVED,
        reviewedAt: new Date(),
        proposedBy: null,
        proposedAt: null,
        isSystem: false,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        parentId: true,
        status: true,
        usageCount: true,
        createdAt: true,
      },
    });

    return ok(
      {
        category: {
          id: created.id,
          title: created.name,
          slug: created.slug,
          icon: created.icon,
          parentId: created.parentId,
          status: created.status,
          usageCount: created.usageCount,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
