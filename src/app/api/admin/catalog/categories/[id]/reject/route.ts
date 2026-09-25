import { CategoryStatus, NotificationType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { logInfo } from "@/lib/logging/logger";
import { deliverNotification } from "@/lib/notifications/delivery";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const bodySchema = z
  .object({
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .optional();

export async function POST(req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Ничего не найдено.", 404, "NOT_FOUND");

    // Body is optional for backwards compatibility with the legacy UI
    // that didn't send one. New admin catalog UI always sends a reason.
    const rawBody = await req.json().catch(() => undefined);
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return fail("Некорректная причина.", 400, "VALIDATION_ERROR");
    }
    const reason = parsed.data?.reason;

    const category = await prisma.globalCategory.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, proposedBy: true, status: true },
    });
    if (!category) {
      return fail("Ничего не найдено.", 404, "NOT_FOUND");
    }
    // ADMIN-CATALOG-UNPUBLISH: отклонить можно и категорию на модерации, и уже
    // опубликованную (снять с публикации) — ровно так кнопку показывает админка
    // (`catalog-row-actions.tsx`) и так же статус меняет PATCH этой категории.
    // Раньше роут принимал только PENDING, и крестик у опубликованной категории
    // отвечал 409 — в админке это выглядело как ошибка без причины.
    if (category.status === CategoryStatus.REJECTED) {
      return fail("Категория уже отклонена. Обновите страницу.", 409, "CONFLICT");
    }
    const wasPublished = category.status === CategoryStatus.APPROVED;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.globalCategory.update({
        where: { id },
        // FIX-R2-05-A: explicit lockstep — a rejected category is hidden (mirrors
        // approve setting visibleToAll=true). For a published category this is
        // the actual unpublish, not defensive symmetry.
        data: { status: "REJECTED", reviewedAt: new Date(), visibleToAll: false },
        select: { id: true, status: true },
      });

      await tx.portfolioItem.updateMany({
        where: { globalCategoryId: id },
        data: { inSearch: false },
      });

      await createAdminAuditLog({
        tx,
        adminUserId: auth.user.id,
        action: "CATEGORY_REJECTED",
        targetType: "category",
        targetId: id,
        details: {
          categorySlug: category.slug,
          name: category.name,
          previousStatus: category.status,
        },
        reason: reason ?? null,
        context: getAdminAuditContext(req),
      });

      return row;
    });

    // ADMIN-CATALOG-A: there is no `GlobalCategory.rejectionReason`
    // column yet (BACKLOG: schema migration). Until that lands we
    // persist the reason in the structured log so it isn't lost.
    if (reason) {
      logInfo("admin.catalog.category.rejected", {
        categoryId: id,
        categoryName: category.name,
        adminUserId: auth.user.id,
        reason,
      });
    }

    if (category.proposedBy) {
      // PUSH-COVERAGE-01: через общую доставку — раньше запись уходила только
      // в центр уведомлений (без пуша), в отличие от всех остальных типов.
      await deliverNotification({
        userId: category.proposedBy,
        type: NotificationType.CATEGORY_REJECTED,
        title: wasPublished ? "Категория снята с публикации" : "Категория отклонена",
        body: wasPublished
          ? reason
            ? `Категория «${category.name}» снята с публикации. Причина: ${reason}`
            : `Категория «${category.name}» снята с публикации.`
          : reason
            ? `Категория «${category.name}» не была одобрена. Причина: ${reason}`
            : `Категория «${category.name}» не была одобрена.`,
        payloadJson: {
          categoryId: category.id,
          status: "REJECTED",
          reason: reason ?? null,
        },
        pushUrl: "/notifications",
      });
    }

    return ok({ category: updated });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
