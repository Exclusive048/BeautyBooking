import { canAccessClientCards, ensureClientCardAccess } from "@/lib/crm/guards";
import { describe, it, expect } from "vitest";

describe("crm/guards", () => {
  it("denies access for missing or FREE tier", () => {
    expect(canAccessClientCards(null)).toBe(false);
    expect(canAccessClientCards(undefined)).toBe(false);
    expect(canAccessClientCards("FREE" as never)).toBe(false);
  });

  it("allows access for paid tiers", () => {
    expect(canAccessClientCards("PRO" as never)).toBe(true);
    expect(canAccessClientCards("PREMIUM" as never)).toBe(true);
  });

  it("throws when access is denied", () => {
    expect(() => ensureClientCardAccess("FREE" as never)).toThrow();
    expect(() => ensureClientCardAccess("PRO" as never)).not.toThrow();
  });
});
