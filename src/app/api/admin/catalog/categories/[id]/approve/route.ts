import { NotificationType } from "@prisma/client";
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
    if (!id) return fail("Категория не найдена.", 404, "NOT_FOUND");

    const category = await prisma.globalCategory.findUnique({
      where: { id },
      select: { id: true, name: true, proposedBy: true },
    });
    if (!category) {
      return fail("Категория не найдена.", 404, "NOT_FOUND");
    }

    const updated = await prisma.globalCategory.update({
      where: { id },
      data: { status: "APPROVED", reviewedAt: new Date() },
      select: { id: true, status: true },
    });

    if (category.proposedBy) {
      const notification = await createNotification({
        userId: category.proposedBy,
        type: NotificationType.CATEGORY_APPROVED,
        title: "Категория одобрена",
        body: `Ваша категория «${category.name}» одобрена. Теперь вы можете создавать услуги в этой категории.`,
        payloadJson: { categoryId: category.id, status: "APPROVED" },
      });
      publishNotifications([notification]);
    }

    return ok({ category: updated });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
