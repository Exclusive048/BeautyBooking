import { NotificationType, SubscriptionScope } from "@prisma/client";
import { createBillingNotification } from "@/lib/billing/notifications";
import { pluralizeDays } from "@/lib/utils/pluralize-days";

const SCOPE_LABEL: Record<SubscriptionScope, string> = {
  MASTER: "мастера",
  STUDIO: "студии",
};

export async function sendTrialEndingSoonNotification(input: {
  userId: string;
  scope: SubscriptionScope;
  subscriptionId: string;
  daysLeft: number;
  trialEndsAt: Date;
}) {
  const dayWord = pluralizeDays(input.daysLeft);
  const scopeLabel = SCOPE_LABEL[input.scope];
  return createBillingNotification({
    userId: input.userId,
    type: NotificationType.BILLING_TRIAL_ENDING_SOON,
    title: "Пробный период скоро закончится",
    body:
      `Через ${input.daysLeft} ${dayWord} тариф PREMIUM для кабинета ${scopeLabel} закончится. ` +
      `Оформите подписку, чтобы сохранить расширенные возможности — или продолжите на бесплатном тарифе.`,
    payloadJson: {
      kind: "trial_ending_soon",
      scope: input.scope,
      subscriptionId: input.subscriptionId,
      daysLeft: input.daysLeft,
      trialEndsAt: input.trialEndsAt.toISOString(),
    },
  });
}

export async function sendTrialExpiredNotification(input: {
  userId: string;
  scope: SubscriptionScope;
  subscriptionId: string;
}) {
  const scopeLabel = SCOPE_LABEL[input.scope];
  return createBillingNotification({
    userId: input.userId,
    type: NotificationType.BILLING_TRIAL_EXPIRED,
    title: "Пробный период закончился",
    body:
      `Пробный месяц PREMIUM для кабинета ${scopeLabel} закончился — аккаунт переведён на бесплатный тариф. ` +
      `Все ваши данные (записи, портфолио, клиенты) сохранены. Чтобы вернуть расширенные возможности, оформите подписку в любой момент.`,
    payloadJson: {
      kind: "trial_expired",
      scope: input.scope,
      subscriptionId: input.subscriptionId,
    },
  });
}
