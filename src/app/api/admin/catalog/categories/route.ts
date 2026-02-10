import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { slugifyCategory } from "@/lib/slug";

const STATUS_VALUES = new Set(["active", "inactive"]);
const MAX_SLUG_LENGTH = 60;

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
});

function normalizeOptional(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

export async function GET(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status")?.toLowerCase() ?? null;
    const tab = url.searchParams.get("tab")?.toLowerCase() ?? null;
    const where =
      status && STATUS_VALUES.has(status)
        ? { isActive: status === "active" }
        : tab === "moderation"
          ? { isActive: false }
          : {};

    const categories = await prisma.globalCategory.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { usageCount: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        isActive: true,
        usageCount: true,
        createdAt: true,
        createdBy: {
          select: { id: true, displayName: true, phone: true, email: true },
        },
      },
    });

    return ok({
      categories: categories.map((category) => ({
        id: category.id,
        title: category.name,
        slug: category.slug,
        icon: category.icon,
        isActive: category.isActive,
        usageCount: category.usageCount,
        createdAt: category.createdAt.toISOString(),
        createdBy: category.createdBy,
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
        return fail("Slug уже занят другой категорией.", 409, "SLUG_TAKEN");
      }
    }

    const uniqueSlug = normalizedSlug ? normalizedSlug : await ensureUniqueSlug(generated);
    const created = await prisma.globalCategory.create({
      data: {
        name: title,
        slug: uniqueSlug,
        icon,
        isActive: true,
        isValidated: true,
        isRejected: false,
      },
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

    return ok(
      {
        category: {
          id: created.id,
          title: created.name,
          slug: created.slug,
          icon: created.icon,
          isActive: created.isActive,
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
