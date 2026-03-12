import { CategoryStatus } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { ok, fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { slugifyCategory } from "@/lib/slug";

const MAX_SLUG_LENGTH = 60;
const PROPOSAL_RATE_LIMIT = {
  windowSeconds: 24 * 60 * 60,
  maxRequests: 3,
};

const proposeSchema = z.object({
  title: z.string().trim().min(2).max(60).optional(),
  name: z.string().trim().min(2).max(60).optional(),
  parentId: z.string().trim().min(1).optional(),
  context: z.string().trim().max(500).optional(),
  isPersonalOnly: z.boolean().optional(),
});

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

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const rateLimit = await checkRateLimit(`rl:categories:propose:${auth.user.id}`, PROPOSAL_RATE_LIMIT);
    if (rateLimit.limited) {
      return fail(
        "Слишком много заявок на категории. Попробуйте позже.",
        429,
        "RATE_LIMITED",
        { retryAfterSeconds: rateLimit.retryAfterSeconds }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = proposeSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const title = (parsed.data.name ?? parsed.data.title ?? "").trim();
    if (!title) {
      return fail("Название категории обязательно.", 400, "VALIDATION_ERROR");
    }
    const parentId = parsed.data.parentId?.trim() || null;
    const context = parsed.data.context?.trim() || null;
    if (parentId) {
      const parent = await prisma.globalCategory.findUnique({
        where: { id: parentId },
        select: { id: true, status: true },
      });
      if (!parent || parent.status !== CategoryStatus.APPROVED) {
        return fail("Родительская категория не найдена.", 404, "NOT_FOUND");
      }
    }

    const baseSlug = slugifyCategory(title, MAX_SLUG_LENGTH);
    const uniqueSlug = await ensureUniqueSlug(baseSlug || "category");
    const created = await prisma.globalCategory.create({
      data: {
        name: title,
        slug: uniqueSlug,
        parentId,
        status: CategoryStatus.PENDING,
        proposedBy: auth.user.id,
        proposedAt: new Date(),
        context,
        reviewedAt: null,
        isSystem: false,
        visibleToAll: false,
        createdByUserId: auth.user.id,
      },
      select: { id: true, name: true, status: true },
    });

    return ok(
      {
        id: created.id,
        title: created.name,
        status: created.status,
      },
      { status: 201 }
    );
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
