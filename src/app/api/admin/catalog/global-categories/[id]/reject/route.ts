import { NotificationType } from "@prisma/client";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
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
      select: { id: true, name: true, proposedBy: true },
    });
    if (!category) {
      return fail("Not found", 404, "NOT_FOUND");
    }

    const result = await prisma.$transaction(async (tx) => {
      const services = await tx.service.findMany({
        where: { globalCategoryId: id },
        select: { id: true },
      });

      await tx.service.updateMany({
        where: { globalCategoryId: id },
        data: { globalCategoryId: null },
      });

      await tx.portfolioItem.updateMany({
        where: { globalCategoryId: id },
        data: {
          globalCategoryId: null,
          categorySource: null,
          inSearch: false,
        },
      });

      await tx.globalCategory.updateMany({
        where: { parentId: id },
        data: { parentId: null },
      });

      await tx.globalCategory.delete({
        where: { id },
      });

      return { detachedServices: services.length };
    });

    if (category.proposedBy) {
      const notification = await createNotification({
        userId: category.proposedBy,
        type: NotificationType.CATEGORY_REJECTED,
        title: "Категория отклонена",
        body: `Категория «${category.name}» не прошла модерацию и была удалена.`,
        payloadJson: { categoryId: category.id, status: "REJECTED" },
      });
      publishNotifications([notification]);
    }

    return ok({ ok: true, detachedServices: result.detachedServices });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

