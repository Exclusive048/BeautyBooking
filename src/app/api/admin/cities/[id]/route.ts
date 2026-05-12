import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { logInfo } from "@/lib/logging/logger";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Edit / delete a city.
 *
 * PATCH  — update any user-editable fields. Slug is intentionally NOT editable
 *          here (it's part of public URLs in cookies/links — change it via
 *          merge if needed).
 * DELETE — hard delete. Allowed only when the city has zero linked providers.
 *          The `Provider.cityId` FK is `onDelete: Restrict`, so Prisma would
 *          throw P2003 anyway; we check up-front to give a friendly message.
 */

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  nameGenitive: z.string().trim().max(80).nullable().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
  autoCreated: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Город не найден.", 404, "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const hasAnyField = Object.values(parsed.data).some((v) => v !== undefined);
    if (!hasAnyField) {
      return fail("Нет данных для обновления.", 400, "VALIDATION_ERROR");
    }

    const existing = await prisma.city.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) return fail("Город не найден.", 404, "NOT_FOUND");

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if (parsed.data.nameGenitive !== undefined) {
      const trimmed = parsed.data.nameGenitive?.trim();
      data.nameGenitive = trimmed && trimmed.length > 0 ? trimmed : null;
    }
    if (parsed.data.latitude !== undefined) data.latitude = parsed.data.latitude;
    if (parsed.data.longitude !== undefined) data.longitude = parsed.data.longitude;
    if (parsed.data.timezone !== undefined) data.timezone = parsed.data.timezone.trim();
    if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
    if (parsed.data.autoCreated !== undefined) data.autoCreated = parsed.data.autoCreated;

    const updated = await prisma.city.update({
      where: { id },
      data,
      select: {
        id: true,
        slug: true,
        name: true,
        nameGenitive: true,
        latitude: true,
        longitude: true,
        timezone: true,
        isActive: true,
        sortOrder: true,
        autoCreated: true,
      },
    });

    logInfo("admin.city.updated", {
      adminId: auth.user.id,
      cityId: id,
      changes: Object.keys(data),
    });

    return ok({ city: updated });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Город не найден.", 404, "NOT_FOUND");

    const city = await prisma.city.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { providers: true } },
      },
    });
    if (!city) return fail("Город не найден.", 404, "NOT_FOUND");

    if (city._count.providers > 0) {
      return fail(
        `К городу привязано ${city._count.providers} провайдер(ов). Сначала перенесите их через слияние.`,
        409,
        "CONFLICT",
        { providersCount: city._count.providers },
      );
    }

    await prisma.city.delete({ where: { id } });

    logInfo("admin.city.deleted", {
      adminId: auth.user.id,
      cityId: id,
      cityName: city.name,
      citySlug: city.slug,
    });

    return ok({ deleted: true });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
