import type { Prisma, SubscriptionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type BillingAuditInput = {
  userId: string;
  scope?: SubscriptionScope | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
  action: string;
  details?: Prisma.InputJsonValue;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function createBillingAuditLog(input: BillingAuditInput, db: DbClient = prisma) {
  return db.billingAuditLog.create({
    data: {
      userId: input.userId,
      scope: input.scope ?? null,
      subscriptionId: input.subscriptionId ?? null,
      paymentId: input.paymentId ?? null,
      action: input.action,
      details: input.details ?? {},
    },
  });
}
