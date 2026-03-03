import type { NotificationType, Prisma } from "@prisma/client";
import { createNotification, publishNotifications } from "@/lib/notifications/service";
import { sendPushToUser } from "@/lib/notifications/push/send";

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
  void sendPushToUser(input.userId, {
    title: record.title,
    body: record.body,
    url: "/cabinet/billing",
  });
  return record;
}
