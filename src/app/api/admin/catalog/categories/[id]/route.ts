import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const patchSchema = z.object({
  title: z.string().trim().min(2).max(60).optional(),
  icon: z.string().trim().max(10).nullable().optional(),
  isActive: z.boolean().optional(),
});

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
      parsed.data.isActive === undefined
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
    if (typeof parsed.data.isActive === "boolean") {
      data.isActive = parsed.data.isActive;
      data.isValidated = parsed.data.isActive;
      data.isRejected = !parsed.data.isActive;
    }

    const updated = await prisma.globalCategory.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        isActive: true,
        usageCount: true,
        createdAt: true,
      },
    });

    return ok({
      category: {
        id: updated.id,
        title: updated.name,
        slug: updated.slug,
        icon: updated.icon,
        isActive: updated.isActive,
        usageCount: updated.usageCount,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
