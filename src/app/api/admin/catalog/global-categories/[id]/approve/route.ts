import { CategoryStatus, NotificationType } from "@prisma/client";
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
      select: { id: true, name: true, proposedBy: true, status: true },
    });
    if (!category) {
      return fail("Not found", 404, "NOT_FOUND");
    }

    await prisma.globalCategory.update({
      where: { id },
      data: {
        status: CategoryStatus.APPROVED,
        visibleToAll: true,
        reviewedAt: new Date(),
      },
      select: { id: true },
    });

    if (category.proposedBy) {
      const notification = await createNotification({
        userId: category.proposedBy,
        type: NotificationType.CATEGORY_APPROVED,
        title: "Категория одобрена",
        body: `Категория «${category.name}» прошла модерацию и доступна в общем каталоге.`,
        payloadJson: { categoryId: category.id, status: "APPROVED" },
      });
      publishNotifications([notification]);
    }

    return ok({ ok: true });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

