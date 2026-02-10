import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";

const patchSchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum(["approve", "reject"]),
});

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  await prisma.globalCategory.upsert({
    where: { slug: "hot" },
    update: { isValidated: true, isRejected: false, icon: "🔥", name: "Горящие" },
    create: {
      name: "Горящие",
      slug: "hot",
      icon: "🔥",
      isValidated: true,
      isRejected: false,
    },
  });

  const categories = await prisma.globalCategory.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      isValidated: true,
      isRejected: true,
      usageCount: true,
      createdAt: true,
      createdBy: {
        select: { id: true, displayName: true, phone: true, email: true },
      },
    },
  });

  const pending = categories.filter((category) => !category.isValidated && !category.isRejected);

  return ok({
    categories: categories.map((category) => ({
      ...category,
      createdAt: category.createdAt.toISOString(),
    })),
    moderation: {
      categories: pending.map((category) => ({
        ...category,
        createdAt: category.createdAt.toISOString(),
      })),
      tags: [],
    },
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const { id, action } = parsed.data;

    const category = await prisma.globalCategory.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!category) {
      return fail("Категория не найдена", 404, "NOT_FOUND");
    }

    const updated = await prisma.globalCategory.update({
      where: { id },
      data:
        action === "approve"
          ? { isValidated: true, isRejected: false }
          : { isValidated: false, isRejected: true },
      select: { id: true, isValidated: true, isRejected: true },
    });

    return ok({ category: updated });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
