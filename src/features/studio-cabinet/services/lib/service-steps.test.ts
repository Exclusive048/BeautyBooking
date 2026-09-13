import { describe, expect, it } from "vitest";
import {
  SERVICE_DURATION_STEP_MIN,
  SERVICE_PRICE_STEP_RUB,
  snapServiceDuration,
  snapServicePrice,
  snapToStep,
} from "./service-steps";

describe("snapToStep", () => {
  it("rounds to the nearest multiple", () => {
    expect(snapToStep("2487", 100, 0)).toBe("2500");
    expect(snapToStep("2449", 100, 0)).toBe("2400");
    expect(snapToStep("47", 10, 10)).toBe("50");
    expect(snapToStep("44", 10, 10)).toBe("40");
  });

  it("leaves an already-aligned value untouched (idempotent)", () => {
    expect(snapToStep("2500", 100, 0)).toBe("2500");
    expect(snapToStep(snapToStep("2487", 100, 0), 100, 0)).toBe("2500");
  });

  it("keeps an empty value empty — the field must stay clearable", () => {
    expect(snapToStep("", 100, 0)).toBe("");
    expect(snapToStep("   ", 100, 0)).toBe("");
  });

  it("returns non-numeric input verbatim — form validation owns the message", () => {
    expect(snapToStep("abc", 100, 0)).toBe("abc");
  });

  it("never returns below the floor", () => {
    expect(snapToStep("3", 10, 10)).toBe("10");
    expect(snapToStep("-500", 100, 0)).toBe("0");
  });
});

describe("service field snappers", () => {
  it("price steps by 100 ₽ and admits a free service", () => {
    expect(SERVICE_PRICE_STEP_RUB).toBe(100);
    expect(snapServicePrice("1490")).toBe("1500");
    expect(snapServicePrice("0")).toBe("0");
  });

  it("duration steps by 10 min and never reaches zero", () => {
    expect(SERVICE_DURATION_STEP_MIN).toBe(10);
    expect(snapServiceDuration("95")).toBe("100");
    expect(snapServiceDuration("1")).toBe("10");
    expect(snapServiceDuration("0")).toBe("10");
  });
});
