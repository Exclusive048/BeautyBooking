import test from "node:test";
import assert from "node:assert/strict";
import { hotSlotRuleSchema } from "@/lib/hot-slots/schemas";

const baseRule = {
  isEnabled: true,
  triggerHours: 24,
  discountType: "PERCENT" as const,
  discountValue: 20,
  applyMode: "ALL_SERVICES" as const,
  minPriceFrom: null,
  serviceIds: [] as string[],
};

test("rejects invalid trigger hours", () => {
  const parsed = hotSlotRuleSchema.safeParse({ ...baseRule, triggerHours: 5 });
  assert.equal(parsed.success, false);
});

test("requires minPriceFrom for PRICE_FROM", () => {
  const parsed = hotSlotRuleSchema.safeParse({ ...baseRule, applyMode: "PRICE_FROM", minPriceFrom: null });
  assert.equal(parsed.success, false);
});

test("requires serviceIds for MANUAL", () => {
  const parsed = hotSlotRuleSchema.safeParse({ ...baseRule, applyMode: "MANUAL", serviceIds: [] });
  assert.equal(parsed.success, false);
});

test("accepts fixed discount within bounds", () => {
  const parsed = hotSlotRuleSchema.safeParse({
    ...baseRule,
    discountType: "FIXED",
    discountValue: 500,
  });
  assert.equal(parsed.success, true);
});
