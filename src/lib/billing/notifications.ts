import type { NotificationType, Prisma } from "@prisma/client";
import { billingUpgradeHref, type BillingScope } from "@/lib/billing/upgrade-href";
import { createNotification, publishNotifications } from "@/lib/notifications/service";
import { sendPushToUser } from "@/lib/notifications/push/send";

type BillingNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payloadJson?: Prisma.InputJsonValue;
  /**
   * The subscription scope this billing event concerns. When provided, the
   * push deep-link targets the scope-correct billing page (FIX-28 — threading
   * the scope the caller already knows). Omitted → bare `/cabinet/billing`,
   * which the route resolves by role (FIX-26 secondary).
   */
  scope?: BillingScope;
};

export async function createBillingNotification(input: BillingNotificationInput) {
  const record = await createNotification({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    payloadJson: input.payloadJson ?? {},
  });
  publishNotifications([record]);
  void sendPushToUser(input.userId, {
    title: record.title,
    body: record.body,
    url: input.scope ? billingUpgradeHref(input.scope) : "/cabinet/billing",
  });
  return record;
}
