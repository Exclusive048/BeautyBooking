import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { createBillingNotification } from "@/lib/billing/notifications";
import { NotificationType } from "@prisma/client";
import { isCurrentMasterManagedByStudio } from "@/lib/master/access";
import { invalidatePlanCache } from "@/lib/billing/get-current-plan";

export const runtime = "nodejs";

const bodySchema = z.object({
  scope: z.enum(["MASTER", "STUDIO"]),
  autoRenew: z.boolean(),
});

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Необходима авторизация.", 401, "UNAUTHORIZED");

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return fail("Неверные данные.", 400, "VALIDATION_ERROR");
  }

  const { scope, autoRenew } = parsed.data;

  if (scope === "MASTER") {
    const managedByStudio = await isCurrentMasterManagedByStudio(user.id);
    if (managedByStudio) {
      return fail("Тарифом мастера в студии управляет студия.", 403, "FORBIDDEN");
    }
  }

  const subscription = await prisma.userSubscription.findUnique({
    where: { userId_scope: { userId: user.id, scope } },
    select: {
      id: true,
      scope: true,
      status: true,
      plan: { select: { code: true, name: true, tier: true } },
    },
  });

  if (!subscription) {
    return fail("Подписка не найдена.", 404, "NOT_FOUND");
  }

  if (subscription.plan.tier === "FREE") {
    return fail("Для бесплатного тарифа автопродление недоступно.", 400, "FREE_PLAN");
  }

  if (subscription.status !== "ACTIVE" && subscription.status !== "PAST_DUE") {
    return fail("Нет активной подписки.", 400, "INACTIVE_SUBSCRIPTION");
  }

  await prisma.userSubscription.update({
    where: { id: subscription.id },
    data: {
      autoRenew,
      ...(autoRenew ? { cancelAtPeriodEnd: false, cancelledAt: null } : {}),
    },
  });

  await invalidatePlanCache(user.id, scope);

  await createBillingAuditLog({
    userId: user.id,
    scope,
    subscriptionId: subscription.id,
    action: autoRenew ? "AUTO_RENEW_ENABLED" : "AUTO_RENEW_DISABLED",
    details: { planCode: subscription.plan.code },
  });

  if (!autoRenew) {
    await createBillingNotification({
      userId: user.id,
      type: NotificationType.BILLING_SUBSCRIPTION_CANCELLED,
      title: "Автопродление отключено",
      body: `Автопродление подписки ${subscription.plan.name} отключено. Доступ сохранится до конца оплаченного периода.`,
      payloadJson: { scope, subscriptionId: subscription.id },
    });
  }

  return ok({ autoRenew });
}
