import { DiscountType } from "@prisma/client";

export type BundlePricing = {
  totalPrice: number;
  discountAmount: number;
  finalPrice: number;
  totalDurationMin: number;
};

/**
 * Pure helper: given a list of service prices/durations and a discount,
 * returns the same numbers the server aggregator computes for the
 * bundle row. Used in `BundleModal` to live-update the preview block as
 * the master toggles services or types into the discount field.
 *
 * PERCENT applies to the sum; FIXED is taken at face value (kopeks)
 * but capped at the sum so the bundle never has a negative final price.
 */
export function computeBundlePricing(input: {
  services: Array<{ price: number; durationMin: number }>;
  discountType: DiscountType;
  discountValue: number;
}): BundlePricing {
  const totalPrice = input.services.reduce((sum, service) => sum + service.price, 0);
  const totalDurationMin = input.services.reduce(
    (sum, service) => sum + service.durationMin,
    0
  );
  const value = Math.max(0, Math.floor(input.discountValue));
  const discountAmount =
    input.discountType === DiscountType.PERCENT
      ? Math.round((totalPrice * value) / 100)
      : Math.min(totalPrice, value);
  const finalPrice = Math.max(0, totalPrice - discountAmount);
  return { totalPrice, discountAmount, finalPrice, totalDurationMin };
}
