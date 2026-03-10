import { addDaysToDateKey, dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { isServiceEligibleForHotRule } from "@/lib/hot-slots/eligibility";
import {
  calculateDiscountedPrice,
  calculateDiscountPercent,
  type HotSlotDiscountType,
} from "@/lib/hot-slots/pricing";

export type RuntimeHotSlotRule = {
  isEnabled: boolean;
  triggerHours: number;
  discountType: HotSlotDiscountType;
  discountValue: number;
  applyMode: "ALL_SERVICES" | "PRICE_FROM" | "MANUAL";
  minPriceFrom: number | null;
  serviceIds: string[];
};

export type DynamicHotSlotResult = {
  isHot: boolean;
  originalPrice: number | null;
  discountedPrice: number | null;
  discountPercent: number | null;
  discountType?: HotSlotDiscountType;
  discountValue?: number;
};

function resolveHotWindowEndUtc(now: Date, triggerHours: number, providerTimeZone: string): Date {
  if (triggerHours === 0) {
    const todayKey = toLocalDateKey(now, providerTimeZone);
    const nextDayKey = addDaysToDateKey(todayKey, 1);
    return dateFromLocalDateKey(nextDayKey, providerTimeZone, 0, 0);
  }
  return new Date(now.getTime() + triggerHours * 60 * 60 * 1000);
}

export function resolveDynamicHotSlotPricing(input: {
  rule: RuntimeHotSlotRule | null | undefined;
  slotStartAtUtc: Date;
  serviceId: string;
  servicePrice: number;
  providerTimeZone: string;
  now?: Date;
}): DynamicHotSlotResult {
  const now = input.now ?? new Date();
  const { rule, slotStartAtUtc, serviceId, servicePrice, providerTimeZone } = input;
  if (!rule) {
    return {
      isHot: false,
      originalPrice: null,
      discountedPrice: null,
      discountPercent: null,
    };
  }

  const isEligible = isServiceEligibleForHotRule(rule, serviceId, servicePrice);
  if (!isEligible) {
    return {
      isHot: false,
      originalPrice: null,
      discountedPrice: null,
      discountPercent: null,
    };
  }

  const hotWindowEndUtc = resolveHotWindowEndUtc(now, rule.triggerHours, providerTimeZone);
  const isHot = slotStartAtUtc > now && slotStartAtUtc <= hotWindowEndUtc;
  if (!isHot) {
    return {
      isHot: false,
      originalPrice: null,
      discountedPrice: null,
      discountPercent: null,
    };
  }

  return {
    isHot: true,
    originalPrice: servicePrice,
    discountedPrice: calculateDiscountedPrice(rule.discountType, rule.discountValue, servicePrice),
    discountPercent: calculateDiscountPercent(rule.discountType, rule.discountValue, servicePrice),
    discountType: rule.discountType,
    discountValue: rule.discountValue,
  };
}
