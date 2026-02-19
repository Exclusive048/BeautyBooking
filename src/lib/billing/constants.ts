export const BILLING_PERIODS = [1, 3, 6, 12] as const;

export type BillingPeriodMonths = (typeof BILLING_PERIODS)[number];

export const PAST_DUE_GRACE_DAYS = 7;
