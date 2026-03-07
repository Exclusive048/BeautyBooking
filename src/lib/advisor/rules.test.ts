import { ADVISOR_RULES } from "@/lib/advisor/rules";
import { describe, it, expect } from "vitest";

describe("advisor/rules", () => {
  const baseStats = {
    hasAvatar: true,
    hasDescription: true,
    portfolioCount: 10,
    totalReviews: 5,
    noShowRate: 0,
    hasDeadTimeSlots: false,
    newClientsLast30Days: 5,
    hasActiveSlots: true,
    atRiskClientsCount: 0,
    lowRatedService: null,
    workingDaysPerWeek: 5,
    servicesWithoutPriceCount: 0,
  };

  it("includes expected rule ids", () => {
    const ids = ADVISOR_RULES.map((rule) => rule.id);
    expect(ids).toContain("empty_profile");
    expect(ids).toContain("low_portfolio");
  });

  it("empty_profile triggers when profile is incomplete", () => {
    const rule = ADVISOR_RULES.find((item) => item.id === "empty_profile");
    expect(rule?.check({ ...baseStats, hasAvatar: false })).toBe(true);
    expect(rule?.check({ ...baseStats, hasDescription: false })).toBe(true);
    expect(rule?.check(baseStats)).toBe(false);
  });

  it("low_portfolio triggers for low count", () => {
    const rule = ADVISOR_RULES.find((item) => item.id === "low_portfolio");
    expect(rule?.check({ ...baseStats, portfolioCount: 2 })).toBe(true);
    expect(rule?.check({ ...baseStats, portfolioCount: 10 })).toBe(false);
  });
});
