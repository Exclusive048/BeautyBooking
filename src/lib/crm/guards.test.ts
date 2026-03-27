import { canAccessClientCards, ensureClientCardAccess } from "@/lib/crm/guards";
import { describe, it, expect } from "vitest";
import type { PlanFeatures } from "@/lib/billing/features";

const NO_FEATURES: PlanFeatures = {
  clientVisitHistory: false,
  clientNotes: false,
} as PlanFeatures;

const PRO_FEATURES: PlanFeatures = {
  clientVisitHistory: true,
  clientNotes: true,
} as PlanFeatures;

describe("crm/guards", () => {
  it("denies access for missing features or features without CRM", () => {
    expect(canAccessClientCards(null)).toBe(false);
    expect(canAccessClientCards(undefined)).toBe(false);
    expect(canAccessClientCards(NO_FEATURES)).toBe(false);
  });

  it("allows access when clientVisitHistory or clientNotes enabled", () => {
    expect(canAccessClientCards(PRO_FEATURES)).toBe(true);
    expect(canAccessClientCards({ clientVisitHistory: true, clientNotes: false } as PlanFeatures)).toBe(true);
    expect(canAccessClientCards({ clientVisitHistory: false, clientNotes: true } as PlanFeatures)).toBe(true);
  });

  it("throws when access is denied", () => {
    expect(() => ensureClientCardAccess(NO_FEATURES)).toThrow();
    expect(() => ensureClientCardAccess(PRO_FEATURES)).not.toThrow();
  });
});
