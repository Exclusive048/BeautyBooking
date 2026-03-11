export const BILLING_PERIODS = [1, 3, 6, 12] as const;
export const BILLING_YEARLY_DISCOUNT = 0.2;

export type BillingPeriodMonths = (typeof BILLING_PERIODS)[number];

export const PAST_DUE_GRACE_DAYS = 7;
