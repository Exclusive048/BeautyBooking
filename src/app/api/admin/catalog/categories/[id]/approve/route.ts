import { CategoryStatus, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { deliverNotification } from "@/lib/notifications/delivery";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, ctx: RouteContext) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await ctx.params;
    if (!id) return fail("Ничего не найдено.", 404, "NOT_FOUND");

    const category = await prisma.globalCategory.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, proposedBy: true, status: true },
    });
    if (!category) {
      return fail("Ничего не найдено.", 404, "NOT_FOUND");
    }
    if (category.status !== CategoryStatus.PENDING) {
      return fail("Категория не находится на модерации.", 409, "CONFLICT");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.globalCategory.update({
        where: { id },
        // FIX-R2-05-A: publish on approve. A provider-proposed category is created
        // `visibleToAll: false` (personal scope); approval MUST flip it to public in
        // lockstep with the status — otherwise it stays absent from the public catalog
        // filter feed + autocomplete (which gate on `visibleToAll=true`) while admin +
        // proposer believe it's live. APPROVED ⟺ visibleToAll=true on every write path.
        data: { status: "APPROVED", reviewedAt: new Date(), visibleToAll: true },
        select: { id: true, status: true },
      });

      await createAdminAuditLog({
        tx,
        adminUserId: auth.user.id,
        action: "CATEGORY_APPROVED",
        targetType: "category",
        targetId: id,
        details: { categorySlug: category.slug, name: category.name },
        context: getAdminAuditContext(req),
      });

      return row;
    });

    if (category.proposedBy) {
      // PUSH-COVERAGE-01: через общую доставку — раньше запись уходила только
      // в центр уведомлений (без пуша), в отличие от всех остальных типов.
      await deliverNotification({
        userId: category.proposedBy,
        type: NotificationType.CATEGORY_APPROVED,
        title: "Категория одобрена",
        body: `Ваша категория «${category.name}» одобрена. Теперь вы можете создавать услуги в этой категории.`,
        payloadJson: { categoryId: category.id, status: "APPROVED" },
        pushUrl: "/notifications",
      });
    }

    return ok({ category: updated });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
