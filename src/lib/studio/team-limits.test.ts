import { describe, expect, it } from "vitest";
import { STUDIO_TEAM_CAP_BY_TIER } from "@/lib/billing/constants";
import {
  isStudioMasterActive,
  STUDIO_ACTIVE_MASTER_WHERE,
} from "@/lib/studio/master-eligibility";
import { isStudioTeamAtCap, resolveStudioTeamCap } from "@/lib/studio/team-limits";

/**
 * BC-CAP — studio team-size cap. Pins the pure decision helpers + the
 * ACTIVE-only counting basis. The DB-aware `ensureStudioTeamLimit` composes
 * these: resolve owner plan → `resolveStudioTeamCap` → count masters matching
 * `STUDIO_ACTIVE_MASTER_WHERE` → `isStudioTeamAtCap`. Enforcement lands at every
 * seat-becomes-ACTIVE point (invite acceptance + re-activate + attach), not only
 * invite-send.
 */

describe("BC-CAP — STUDIO_TEAM_CAP_BY_TIER (explicit per-tier caps)", () => {
  it("keeps FREE = 2 (unchanged)", () => {
    expect(STUDIO_TEAM_CAP_BY_TIER.FREE).toBe(2);
  });

  it("sets explicit PRO / PREMIUM caps (product-confirmed)", () => {
    // Product-confirmed final values (Artem, BILLING-CAP-01-FIX).
    expect(STUDIO_TEAM_CAP_BY_TIER.PRO).toBe(6);
    expect(STUDIO_TEAM_CAP_BY_TIER.PREMIUM).toBe(20);
  });

  it("PRO / PREMIUM caps are higher than FREE (upgrade raises the cap)", () => {
    const free = STUDIO_TEAM_CAP_BY_TIER.FREE ?? 0;
    const pro = STUDIO_TEAM_CAP_BY_TIER.PRO ?? Infinity;
    const premium = STUDIO_TEAM_CAP_BY_TIER.PREMIUM ?? Infinity;
    expect(pro).toBeGreaterThan(free);
    expect(premium).toBeGreaterThanOrEqual(pro);
  });
});

describe("BC-CAP — resolveStudioTeamCap (single plan→cap lookup)", () => {
  it("returns the plan's maxTeamMasters feature", () => {
    expect(resolveStudioTeamCap({ maxTeamMasters: 2 })).toBe(2);
    expect(resolveStudioTeamCap({ maxTeamMasters: 6 })).toBe(6);
  });

  it("returns null for an unlimited plan", () => {
    expect(resolveStudioTeamCap({ maxTeamMasters: null })).toBeNull();
  });

  it("reflects an upgraded plan's higher cap", () => {
    const freeCap = resolveStudioTeamCap({ maxTeamMasters: STUDIO_TEAM_CAP_BY_TIER.FREE });
    const proCap = resolveStudioTeamCap({ maxTeamMasters: STUDIO_TEAM_CAP_BY_TIER.PRO });
    expect(proCap ?? Infinity).toBeGreaterThan(freeCap ?? 0);
  });
});

describe("BC-CAP — isStudioTeamAtCap (enforcement boundary)", () => {
  it("allows adding below the cap", () => {
    expect(isStudioTeamAtCap(1, 2)).toBe(false);
    expect(isStudioTeamAtCap(0, 2)).toBe(false);
  });

  it("blocks once ACTIVE count reaches the cap (accepting the next seat exceeds it)", () => {
    // FREE studio with 2 ACTIVE masters — the 3rd seat (invite accept /
    // re-activate / attach) is blocked at the enforcement point.
    expect(isStudioTeamAtCap(2, 2)).toBe(true);
  });

  it("blocks above the cap", () => {
    expect(isStudioTeamAtCap(3, 2)).toBe(true);
  });

  it("never blocks for an unlimited (null) cap", () => {
    expect(isStudioTeamAtCap(0, null)).toBe(false);
    expect(isStudioTeamAtCap(100, null)).toBe(false);
  });
});

describe("BC-CAP — ACTIVE-only counting basis", () => {
  it("counts an ACTIVE master (invite accepted + not paused in the studio)", () => {
    expect(isStudioMasterActive({ ownerUserId: "u1", studioPaused: false })).toBe(true);
  });

  it("does NOT count an INVITED master (invite not accepted — ownerUserId null)", () => {
    expect(isStudioMasterActive({ ownerUserId: null, studioPaused: false })).toBe(false);
    // ...even if the stub is not paused — an unclaimed seat is not consumed.
    expect(isStudioMasterActive({ ownerUserId: null, studioPaused: true })).toBe(false);
  });

  it("does NOT count a DISABLED master (paused in the studio)", () => {
    expect(isStudioMasterActive({ ownerUserId: "u1", studioPaused: true })).toBe(false);
  });

  it("STUDIO_ACTIVE_MASTER_WHERE is the query equivalent (ownerUserId set + not paused)", () => {
    // Pins the counting basis the DB query uses so it can't drift from the
    // in-memory predicate. Pending invites are a separate table (StudioInvite)
    // entirely — they never appear in this master-count.
    // STUDIO-PAUSE-SPLIT-01: `isPublished` is the master's PERSONAL visibility
    // and must not appear here — a master who hides his own page keeps working
    // in the studio, and a studio pause no longer hides his page.
    expect(STUDIO_ACTIVE_MASTER_WHERE).toEqual({
      ownerUserId: { not: null },
      studioPaused: false,
    });
  });
});
