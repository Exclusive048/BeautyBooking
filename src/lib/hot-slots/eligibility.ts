export type HotSlotRuleSnapshot = {
  isEnabled: boolean;
  applyMode: "ALL_SERVICES" | "PRICE_FROM" | "MANUAL";
  minPriceFrom: number | null;
  serviceIds: string[];
};

export function isServiceEligibleForHotRule(
  rule: HotSlotRuleSnapshot | null | undefined,
  serviceId: string,
  servicePrice: number
): boolean {
  if (!rule?.isEnabled) return false;

  if (rule.applyMode === "ALL_SERVICES") {
    return true;
  }

  if (rule.applyMode === "MANUAL") {
    return rule.serviceIds.includes(serviceId);
  }

  if (rule.applyMode === "PRICE_FROM") {
    return rule.minPriceFrom !== null && servicePrice >= rule.minPriceFrom;
  }

  return false;
}
