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
 * Merge `source` city → `target` city.
 *
 * Used to fix duplicates the geocoder created (e.g. "Санкт-Петербург" vs
 * "Saint Petersburg"). All providers attached to `source` get re-pointed
 * to `target`, then `source` is deleted. Target's lat/lng/timezone wins
 * (admin will have already verified target's data).
 *
 * Wrapped in a single transaction — partial state (providers re-pointed
 * but source still exists, or vice versa) would be much worse than a
 * rollback on failure.
 *
 * Cookie compatibility: clients holding the old `source.slug` in their
 * cookie will simply see the selector fall back to "Сменить город" on
 * the next page load (server-city.ts treats unknown slugs as null,
 * does not auto-clear). They pick a city, life moves on.
 */

const bodySchema = z.object({
  targetCityId: z.string().trim().min(1),
});

export async function POST(req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id: sourceId } = await ctx.params;
    if (!sourceId) return fail("Город-источник не найден.", 404, "NOT_FOUND");

    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const targetId = parsed.data.targetCityId;

    if (sourceId === targetId) {
      return fail("Нельзя слить город сам с собой.", 400, "VALIDATION_ERROR");
    }

    const [source, target] = await Promise.all([
      prisma.city.findUnique({
        where: { id: sourceId },
        select: { id: true, name: true, slug: true, _count: { select: { providers: true } } },
      }),
      prisma.city.findUnique({
        where: { id: targetId },
        select: { id: true, name: true, slug: true, isActive: true },
      }),
    ]);

    if (!source) return fail("Город-источник не найден.", 404, "NOT_FOUND");
    if (!target) return fail("Город-получатель не найден.", 404, "NOT_FOUND");

    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.provider.updateMany({
        where: { cityId: sourceId },
        data: { cityId: targetId },
      });

      await tx.city.delete({ where: { id: sourceId } });

      return { movedProviders: updateResult.count };
    });

    logInfo("admin.city.merged", {
      adminId: auth.user.id,
      sourceCityId: source.id,
      sourceSlug: source.slug,
      sourceName: source.name,
      targetCityId: target.id,
      targetSlug: target.slug,
      targetName: target.name,
      movedProviders: result.movedProviders,
    });

    return ok({
      merged: true,
      movedProviders: result.movedProviders,
      target: { id: target.id, name: target.name, slug: target.slug },
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
