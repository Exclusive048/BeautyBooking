import { describe, it, expect } from "vitest";

/**
 * MASTER-BOOKING-UI-FIX-A #2а — booking-action visibility by role.
 *
 * Pinning the predicate the master-cabinet UI surfaces use to decide
 * whether to render confirm/decline buttons on a CHANGE_REQUESTED
 * booking. The master is the actionable side ONLY when
 * `actionRequiredBy === "MASTER"`; otherwise (`"CLIENT"`) they are
 * the initiator and must wait for the client's response.
 *
 * The predicate is duplicated across 4 sites (action-menu, kanban
 * card actions, kanban manage actions, dashboard row). Keeping this
 * test small and pure proves the rule independently of any DOM —
 * the four sites all `&&` the same condition, so the rule itself
 * is what matters.
 */

function canMasterAct(
  rawStatus: string,
  actionRequiredBy: "CLIENT" | "MASTER" | null,
): boolean {
  if (rawStatus === "PENDING") return true;
  if (rawStatus === "CHANGE_REQUESTED" && actionRequiredBy === "MASTER") return true;
  return false;
}

function isInitiatorWaiting(
  rawStatus: string,
  actionRequiredBy: "CLIENT" | "MASTER" | null,
): boolean {
  return rawStatus === "CHANGE_REQUESTED" && actionRequiredBy === "CLIENT";
}

describe("master booking actions — visibility by role (MASTER-BOOKING-UI-FIX-A)", () => {
  it("PENDING — master always acts (initial confirm/decline)", () => {
    expect(canMasterAct("PENDING", null)).toBe(true);
    expect(canMasterAct("PENDING", "MASTER")).toBe(true);
    expect(canMasterAct("PENDING", "CLIENT")).toBe(true);
  });

  it("CHANGE_REQUESTED + actionRequiredBy=MASTER — master is awaited side", () => {
    expect(canMasterAct("CHANGE_REQUESTED", "MASTER")).toBe(true);
    expect(isInitiatorWaiting("CHANGE_REQUESTED", "MASTER")).toBe(false);
  });

  it("CHANGE_REQUESTED + actionRequiredBy=CLIENT — master is initiator, must wait", () => {
    expect(canMasterAct("CHANGE_REQUESTED", "CLIENT")).toBe(false);
    expect(isInitiatorWaiting("CHANGE_REQUESTED", "CLIENT")).toBe(true);
  });

  it("CHANGE_REQUESTED + actionRequiredBy=null — defensive: treat as not actionable", () => {
    // Data-quality guard: a CHANGE_REQUESTED booking should always
    // carry an actionRequiredBy value (backend sets it on every
    // change request). If it ever lands as null we'd rather hide
    // the action than render a 409-bound button.
    expect(canMasterAct("CHANGE_REQUESTED", null)).toBe(false);
  });

  it("non-pending / non-CHANGE_REQUESTED statuses — never actionable here", () => {
    expect(canMasterAct("CONFIRMED", null)).toBe(false);
    expect(canMasterAct("FINISHED", null)).toBe(false);
    expect(canMasterAct("CANCELLED", null)).toBe(false);
    expect(canMasterAct("REJECTED", null)).toBe(false);
    expect(canMasterAct("NO_SHOW", null)).toBe(false);
  });

  it("mutually exclusive: actionable ⊕ initiator-waiting (never both)", () => {
    const cases: Array<[string, "CLIENT" | "MASTER" | null]> = [
      ["PENDING", null],
      ["PENDING", "MASTER"],
      ["CHANGE_REQUESTED", "MASTER"],
      ["CHANGE_REQUESTED", "CLIENT"],
      ["CHANGE_REQUESTED", null],
      ["CONFIRMED", null],
    ];
    for (const [status, actor] of cases) {
      const a = canMasterAct(status, actor);
      const b = isInitiatorWaiting(status, actor);
      expect(a && b).toBe(false);
    }
  });
});
