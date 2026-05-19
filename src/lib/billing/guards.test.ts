import { describe, it, expect } from "vitest";
import { AppError } from "@/lib/api/errors";
import {
  createFeatureGateError,
  createLimitReachedError,
  createSystemDisabledError,
} from "@/lib/billing/guards";

describe("billing/guards — createFeatureGateError", () => {
  it("returns AppError with 403 + FEATURE_GATE code", () => {
    const err = createFeatureGateError("hotSlots", "PRO");
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("FEATURE_GATE");
  });

  it("attaches feature key + requiredPlan in details", () => {
    const err = createFeatureGateError("analytics_revenue", "PREMIUM");
    expect(err.details).toMatchObject({ feature: "analytics_revenue", requiredPlan: "PREMIUM" });
  });

  it("works without requiredPlan", () => {
    const err = createFeatureGateError("hotSlots");
    expect(err).toBeInstanceOf(AppError);
    expect(err.details).toMatchObject({ feature: "hotSlots" });
  });
});

describe("billing/guards — createSystemDisabledError", () => {
  it("returns AppError with 403 + SYSTEM_FEATURE_DISABLED", () => {
    const err = createSystemDisabledError("onlinePayments");
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("SYSTEM_FEATURE_DISABLED");
    expect(err.details).toMatchObject({ feature: "onlinePayments" });
  });
});

describe("billing/guards — createLimitReachedError", () => {
  it("returns AppError with 409 + LIMIT_REACHED", () => {
    const err = createLimitReachedError("maxTeamMasters", 5, 5);
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("LIMIT_REACHED");
    expect(err.details).toMatchObject({ limitKey: "maxTeamMasters", max: 5, current: 5 });
  });

  it("preserves max/current values for client display", () => {
    const err = createLimitReachedError("maxPortfolioPhotosSolo", 15, 16);
    expect(err.details).toMatchObject({ max: 15, current: 16 });
  });
});
