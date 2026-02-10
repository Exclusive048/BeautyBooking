import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";

export async function GET() {
  try {
    const categories = await prisma.globalCategory.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, icon: true, usageCount: true },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    });

    return ok({
      categories: categories.map((category) => ({
        id: category.id,
        title: category.name,
        slug: category.slug,
        icon: category.icon,
        usageCount: category.usageCount,
      })),
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
