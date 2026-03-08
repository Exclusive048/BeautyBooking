import { CategoryStatus, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { createNotification, publishNotifications } from "@/lib/notifications/service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Not found", 404, "NOT_FOUND");

    const category = await prisma.globalCategory.findUnique({
      where: { id },
      select: { id: true, name: true, proposedBy: true, status: true },
    });
    if (!category) {
      return fail("Not found", 404, "NOT_FOUND");
    }
    if (category.status !== CategoryStatus.PENDING) {
      return fail("Category is not pending moderation", 409, "CONFLICT");
    }

    const updated = await prisma.globalCategory.update({
      where: { id },
      data: { status: "REJECTED", reviewedAt: new Date() },
      select: { id: true, status: true },
    });

    await prisma.portfolioItem.updateMany({
      where: { globalCategoryId: id },
      data: { inSearch: false },
    });

    if (category.proposedBy) {
      const notification = await createNotification({
        userId: category.proposedBy,
        type: NotificationType.CATEGORY_REJECTED,
        title: "Категория отклонена",
        body: `Категория «${category.name}» не была одобрена.`,
        payloadJson: { categoryId: category.id, status: "REJECTED" },
      });
      publishNotifications([notification]);
    }

    return ok({ category: updated });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
