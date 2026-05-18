import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/api/errors";
import {
  assertAcceptsNewClient,
  assertBookingWindow,
  clampVisibleSlotsHorizon,
  earliestBookableUtc,
  isWithinBookableWindow,
  latestBookableUtc,
} from "./policy-enforcement";

const NOW = new Date("2026-05-20T10:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 60 * 60 * 1000);
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("policy-enforcement / earliestBookableUtc", () => {
  it("returns now + N hours", () => {
    expect(earliestBookableUtc({ minBookingHoursAhead: 2 }, NOW).toISOString()).toBe(
      hours(2).toISOString(),
    );
  });
  it("clamps negative N to 0", () => {
    expect(earliestBookableUtc({ minBookingHoursAhead: -5 }, NOW).getTime()).toBe(NOW.getTime());
  });
});

describe("policy-enforcement / latestBookableUtc", () => {
  it("returns now + N days", () => {
    expect(latestBookableUtc({ maxBookingDaysAhead: 30 }, NOW).toISOString()).toBe(
      days(30).toISOString(),
    );
  });
  it("clamps zero/negative to 1 day minimum", () => {
    expect(latestBookableUtc({ maxBookingDaysAhead: 0 }, NOW).toISOString()).toBe(
      days(1).toISOString(),
    );
  });
});

describe("policy-enforcement / isWithinBookableWindow", () => {
  const policy = { minBookingHoursAhead: 2, maxBookingDaysAhead: 30 };
  it("accepts a slot inside the window", () => {
    expect(isWithinBookableWindow(hours(5), policy, NOW)).toBe(true);
  });
  it("rejects a slot before the earliest moment", () => {
    expect(isWithinBookableWindow(hours(1), policy, NOW)).toBe(false);
  });
  it("rejects a slot past the latest moment", () => {
    expect(isWithinBookableWindow(days(31), policy, NOW)).toBe(false);
  });
  it("accepts the boundary slots inclusively", () => {
    expect(isWithinBookableWindow(hours(2), policy, NOW)).toBe(true);
    expect(isWithinBookableWindow(days(30), policy, NOW)).toBe(true);
  });
});

describe("policy-enforcement / assertBookingWindow", () => {
  const policy = { minBookingHoursAhead: 2, maxBookingDaysAhead: 30 };
  it("passes silently for in-window times", () => {
    expect(() => assertBookingWindow(hours(5), policy, NOW)).not.toThrow();
  });
  it("throws BOOKING_TOO_SOON below earliest", () => {
    try {
      assertBookingWindow(hours(1), policy, NOW);
      throw new Error("did not throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("BOOKING_TOO_SOON");
      expect((err as AppError).status).toBe(400);
    }
  });
  it("throws BOOKING_TOO_FAR above latest", () => {
    try {
      assertBookingWindow(days(31), policy, NOW);
      throw new Error("did not throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("BOOKING_TOO_FAR");
      expect((err as AppError).status).toBe(400);
    }
  });
});

describe("policy-enforcement / assertAcceptsNewClient", () => {
  it("passes when acceptNewClients=true regardless of priors", () => {
    expect(() => assertAcceptsNewClient({ acceptNewClients: true }, 0)).not.toThrow();
    expect(() => assertAcceptsNewClient({ acceptNewClients: true }, 3)).not.toThrow();
  });
  it("passes when acceptNewClients=false but client has prior bookings", () => {
    expect(() => assertAcceptsNewClient({ acceptNewClients: false }, 1)).not.toThrow();
  });
  it("throws NEW_CLIENTS_CLOSED when acceptNewClients=false and no priors", () => {
    try {
      assertAcceptsNewClient({ acceptNewClients: false }, 0);
      throw new Error("did not throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("NEW_CLIENTS_CLOSED");
      expect((err as AppError).status).toBe(403);
    }
  });
});

describe("policy-enforcement / clampVisibleSlotsHorizon", () => {
  it("uses the policy horizon when no requested toKey is given", () => {
    // policy 7 days, NOW = 2026-05-20 → horizon = 2026-05-26
    expect(clampVisibleSlotsHorizon(null, { visibleSlotDays: 7 }, NOW)).toBe("2026-05-26");
  });
  it("uses the requested toKey when it's shorter than the horizon", () => {
    expect(clampVisibleSlotsHorizon("2026-05-22", { visibleSlotDays: 30 }, NOW)).toBe("2026-05-22");
  });
  it("clamps a requested toKey beyond the horizon", () => {
    expect(clampVisibleSlotsHorizon("2026-12-31", { visibleSlotDays: 7 }, NOW)).toBe("2026-05-26");
  });
  it("clamps zero/negative visibleSlotDays to 1", () => {
    expect(clampVisibleSlotsHorizon(null, { visibleSlotDays: 0 }, NOW)).toBe("2026-05-20");
  });
});
