import { CategoryStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_CATEGORY_DEPTH = 3;

const patchSchema = z.object({
  title: z.string().trim().min(2).max(60).optional(),
  icon: z.string().trim().max(10).nullable().optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  status: z.nativeEnum(CategoryStatus).optional(),
  isSystem: z.boolean().optional(),
});

async function wouldCreateCycle(categoryId: string, newParentId: string): Promise<boolean> {
  let current: string | null = newParentId;
  let depth = 0;

  while (current !== null) {
    if (current === categoryId) return true;
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

export async function PATCH(req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Категория не найдена.", 404, "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    if (
      parsed.data.title === undefined &&
      parsed.data.icon === undefined &&
      parsed.data.parentId === undefined &&
      parsed.data.status === undefined &&
      parsed.data.isSystem === undefined
    ) {
      return fail("Нет данных для обновления.", 400, "VALIDATION_ERROR");
    }

    const existing = await prisma.globalCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return fail("Категория не найдена.", 404, "NOT_FOUND");
    }

    const data: Record<string, unknown> = {};
    if (typeof parsed.data.title === "string") {
      data.name = parsed.data.title.trim();
    }
    if (parsed.data.icon !== undefined) {
      const trimmed = parsed.data.icon?.trim();
      data.icon = trimmed && trimmed.length > 0 ? trimmed : null;
    }
    if (parsed.data.parentId !== undefined) {
      const parentId = parsed.data.parentId?.trim() || null;
      if (parentId) {
        if (parentId === id) {
          return fail("Категория не может быть родителем самой себе.", 400, "VALIDATION_ERROR");
        }
        const parent = await prisma.globalCategory.findUnique({
          where: { id: parentId },
          select: { id: true },
        });
        if (!parent) {
          return fail("Родительская категория не найдена.", 404, "NOT_FOUND");
        }
        const hasCycle = await wouldCreateCycle(id, parentId);
        if (hasCycle) {
          return fail("Circular category reference", 400, "BAD_REQUEST");
        }
      }
      data.parentId = parentId;
    }
    if (parsed.data.status !== undefined) {
      data.status = parsed.data.status;
      data.reviewedAt = parsed.data.status === CategoryStatus.PENDING ? null : new Date();
    }
    if (parsed.data.isSystem !== undefined) {
      data.isSystem = parsed.data.isSystem;
    }

    const shouldDisableInSearch =
      parsed.data.status === CategoryStatus.REJECTED || parsed.data.isSystem === true;

    const updated = await prisma.globalCategory.update({
      where: { id },
      data,
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

    if (shouldDisableInSearch) {
      await prisma.portfolioItem.updateMany({
        where: { globalCategoryId: id },
        data: { inSearch: false },
      });
    }

    return ok({
      category: {
        id: updated.id,
        title: updated.name,
        slug: updated.slug,
        icon: updated.icon,
        parentId: updated.parentId,
        status: updated.status,
        usageCount: updated.usageCount,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
