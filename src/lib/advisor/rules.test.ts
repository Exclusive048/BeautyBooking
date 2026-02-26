import test from "node:test";
import assert from "node:assert/strict";
import { ADVISOR_RULES } from "@/lib/advisor/rules";
import type { MasterStats } from "@/lib/advisor/types";

const baseStats: MasterStats = {
  hasAvatar: true,
  hasDescription: true,
  portfolioCount: 10,
  totalReviews: 1,
  noShowRate: 0.05,
  hasDeadTimeSlots: false,
  newClientsLast30Days: 2,
  hasActiveSlots: true,
  atRiskClientsCount: 0,
  lowRatedService: null,
  workingDaysPerWeek: 5,
  servicesWithoutPriceCount: 0,
};

const rulesById = new Map(ADVISOR_RULES.map((rule) => [rule.id, rule]));

function getRule(id: string) {
  const rule = rulesById.get(id);
  assert.ok(rule, `Rule ${id} is missing`);
  return rule;
}

test("empty_profile rule triggers", () => {
  const rule = getRule("empty_profile");
  assert.equal(rule.check({ ...baseStats, hasAvatar: false }), true);
});

test("low_portfolio rule triggers", () => {
  const rule = getRule("low_portfolio");
  assert.equal(rule.check({ ...baseStats, portfolioCount: 0 }), true);
});

test("no_reviews rule triggers", () => {
  const rule = getRule("no_reviews");
  assert.equal(rule.check({ ...baseStats, totalReviews: 0 }), true);
});

test("high_noshow rule triggers", () => {
  const rule = getRule("high_noshow");
  assert.equal(rule.check({ ...baseStats, noShowRate: 0.25 }), true);
});

test("dead_slots rule triggers", () => {
  const rule = getRule("dead_slots");
  assert.equal(rule.check({ ...baseStats, hasDeadTimeSlots: true }), true);
});

test("no_new_clients rule triggers", () => {
  const rule = getRule("no_new_clients");
  assert.equal(rule.check({ ...baseStats, newClientsLast30Days: 0 }), true);
});

test("at_risk_clients rule triggers", () => {
  const rule = getRule("at_risk_clients");
  assert.equal(rule.check({ ...baseStats, atRiskClientsCount: 3 }), true);
});

test("low_rated_service rule triggers", () => {
  const rule = getRule("low_rated_service");
  assert.equal(
    rule.check({ ...baseStats, lowRatedService: { name: "Test", rating: 3.4 } }),
    true
  );
});

test("sparse_schedule rule triggers", () => {
  const rule = getRule("sparse_schedule");
  assert.equal(rule.check({ ...baseStats, workingDaysPerWeek: 2 }), true);
});

test("services_without_price rule triggers", () => {
  const rule = getRule("services_without_price");
  assert.equal(rule.check({ ...baseStats, servicesWithoutPriceCount: 1 }), true);
});
