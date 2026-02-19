import type { NotificationType, Prisma } from "@prisma/client";
import { createNotification, publishNotifications } from "@/lib/notifications/service";

type BillingNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payloadJson?: Prisma.InputJsonValue;
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
  return record;
}
