import { hotSlotRuleSchema } from "@/lib/hot-slots/schemas";
import { describe, it, expect } from "vitest";
describe("hot-slots/validation", () => {
  const baseRule = {
    isEnabled: true,
    triggerHours: 24,
    discountType: "PERCENT" as const,
    discountValue: 20,
    applyMode: "ALL_SERVICES" as const,
    minPriceFrom: null,
    serviceIds: [] as string[],
  };

  it("rejects invalid trigger hours", () => {
    const parsed = hotSlotRuleSchema.safeParse({ ...baseRule, triggerHours: 5 });
    expect(parsed.success).toBe(false);
  });

  it("requires minPriceFrom for PRICE_FROM", () => {
    const parsed = hotSlotRuleSchema.safeParse({ ...baseRule, applyMode: "PRICE_FROM", minPriceFrom: null });
    expect(parsed.success).toBe(false);
  });

  it("requires serviceIds for MANUAL", () => {
    const parsed = hotSlotRuleSchema.safeParse({ ...baseRule, applyMode: "MANUAL", serviceIds: [] });
    expect(parsed.success).toBe(false);
  });

  it("accepts fixed discount within bounds", () => {
    const parsed = hotSlotRuleSchema.safeParse({
      ...baseRule,
      discountType: "FIXED",
      discountValue: 500,
    });
    expect(parsed.success).toBe(true);
  });
});
