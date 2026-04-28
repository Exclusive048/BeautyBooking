import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { citySlugFromName, normalizeCityName } from "@/lib/cities/normalize";
import { logInfo } from "@/lib/logging/logger";

export const runtime = "nodejs";

/**
 * Admin-only city management.
 *
 * GET   — full list with provider counts. Auto-created cities surface first
 *         (admins typically need to verify them), then alphabetical by name.
 * POST  — manual create. Used when geocoder couldn't help (rare). Slug is
 *         derived from name unless explicitly provided.
 */

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Слаг может содержать только латиницу, цифры и дефис")
    .optional(),
  nameGenitive: z.string().trim().min(2).max(80).optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().trim().min(3).max(64).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const cities = await prisma.city.findMany({
      orderBy: [
        { autoCreated: "desc" }, // auto-created first (need verification)
        { name: "asc" },
      ],
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
        createdAt: true,
        updatedAt: true,
        _count: { select: { providers: true } },
      },
    });

    return ok({
      items: cities.map((city) => ({
        ...city,
        providersCount: city._count.providers,
        createdAt: city.createdAt.toISOString(),
        updatedAt: city.updatedAt.toISOString(),
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

    const name = normalizeCityName(parsed.data.name);
    const slug = parsed.data.slug?.toLowerCase() ?? citySlugFromName(name);

    if (!slug) {
      return fail("Не удалось сформировать слаг города. Укажите вручную.", 400, "VALIDATION_ERROR");
    }

    const existing = await prisma.city.findUnique({ where: { slug }, select: { id: true } });
    if (existing) {
      return fail("Город с таким слагом уже существует.", 409, "ALREADY_EXISTS");
    }

    const created = await prisma.city.create({
      data: {
        name,
        slug,
        nameGenitive: parsed.data.nameGenitive?.trim() || null,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        timezone: parsed.data.timezone?.trim() || "Europe/Moscow",
        sortOrder: parsed.data.sortOrder ?? 100,
        isActive: parsed.data.isActive ?? true,
        autoCreated: false, // manual create from admin
      },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    logInfo("admin.city.created", {
      adminId: auth.user.id,
      cityId: created.id,
      cityName: created.name,
      citySlug: created.slug,
    });

    return ok({ city: created }, { status: 201 });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
