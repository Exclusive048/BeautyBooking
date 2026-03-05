import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { createBillingNotification } from "@/lib/billing/notifications";
import { NotificationType } from "@prisma/client";

export const runtime = "nodejs";

const bodySchema = z.object({
  scope: z.enum(["MASTER", "STUDIO"]),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Необходима авторизация.", 401, "UNAUTHORIZED");

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return fail("Неверные данные.", 400, "VALIDATION_ERROR");
  }

  const subscription = await prisma.userSubscription.findUnique({
    where: { userId_scope: { userId: user.id, scope: parsed.data.scope } },
    select: { id: true, scope: true, plan: { select: { code: true, name: true } } },
  });

  if (!subscription) {
    return fail("Подписка не найдена.", 404, "NOT_FOUND");
  }

  const now = new Date();
  await prisma.userSubscription.update({
    where: { id: subscription.id },
    data: {
      cancelAtPeriodEnd: true,
      autoRenew: false,
      cancelledAt: now,
    },
  });

  await createBillingAuditLog({
    userId: user.id,
    scope: subscription.scope,
    subscriptionId: subscription.id,
    action: "SUBSCRIPTION_CANCELLED",
    details: { planCode: subscription.plan.code },
  });

  await createBillingNotification({
    userId: user.id,
    type: NotificationType.BILLING_SUBSCRIPTION_CANCELLED,
    title: "Автопродление отключено",
    body: `Автопродление подписки ${subscription.plan.name} отключено. Доступ сохранится до конца оплаченного периода.`,
    payloadJson: { scope: subscription.scope, subscriptionId: subscription.id },
  });

  return ok({ ok: true });
}
