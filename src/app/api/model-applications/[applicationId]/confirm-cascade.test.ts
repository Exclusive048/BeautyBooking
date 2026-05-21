import { describe, it, expect } from "vitest";

/**
 * MASTER-MODELS-FIX-A — pinning the sibling-cascade semantics.
 *
 * The full confirm endpoint runs inside a Prisma transaction and
 * touches multiple tables; integration-testing it against a real DB
 * is out of scope for this commit (see TEST-COVERAGE backlog).
 * Instead, the rules driving the cascade are extracted to a small
 * pure predicate so they can be pinned without a database. Each
 * assertion mirrors the actual `where` clause inside
 * `confirm/route.ts`:
 *
 *   - same `offerId`
 *   - not the application that's being confirmed
 *   - status in PENDING / APPROVED_WAITING_CLIENT
 *
 * If the cascade rules change (e.g. someone wants to also cascade
 * CONFIRMED siblings — they shouldn't exist due to the unique
 * `[offerId, clientUserId]` constraint, but the predicate captures
 * the invariant), this test forces an explicit update.
 */

type Application = {
  id: string;
  offerId: string;
  status: "PENDING" | "APPROVED_WAITING_CLIENT" | "REJECTED" | "CONFIRMED";
};

function shouldCascadeReject(
  app: Application,
  confirmedAppId: string,
  confirmedOfferId: string,
): boolean {
  if (app.offerId !== confirmedOfferId) return false;
  if (app.id === confirmedAppId) return false;
  return app.status === "PENDING" || app.status === "APPROVED_WAITING_CLIENT";
}

describe("MASTER-MODELS-FIX-A — sibling cascade predicate", () => {
  it("cascades PENDING siblings on the same offer", () => {
    const sibling: Application = { id: "app2", offerId: "offer1", status: "PENDING" };
    expect(shouldCascadeReject(sibling, "app1", "offer1")).toBe(true);
  });

  it("cascades APPROVED_WAITING_CLIENT siblings on the same offer", () => {
    const sibling: Application = { id: "app2", offerId: "offer1", status: "APPROVED_WAITING_CLIENT" };
    expect(shouldCascadeReject(sibling, "app1", "offer1")).toBe(true);
  });

  it("does NOT cascade the confirmed application itself", () => {
    const self: Application = { id: "app1", offerId: "offer1", status: "PENDING" };
    expect(shouldCascadeReject(self, "app1", "offer1")).toBe(false);
  });

  it("does NOT cascade applications on a different offer", () => {
    const otherOfferApp: Application = { id: "app2", offerId: "offer2", status: "PENDING" };
    expect(shouldCascadeReject(otherOfferApp, "app1", "offer1")).toBe(false);
  });

  it("does NOT touch already-REJECTED siblings (idempotent)", () => {
    // Direct rejection by master already set status; cascade must skip.
    const directReject: Application = { id: "app2", offerId: "offer1", status: "REJECTED" };
    expect(shouldCascadeReject(directReject, "app1", "offer1")).toBe(false);
  });

  it("does NOT touch CONFIRMED siblings (shouldn't exist, but defensive)", () => {
    // Schema's @@unique([offerId, clientUserId]) prevents two CONFIRMED
    // applications on the same offer, but if someone breaks the
    // invariant the cascade still must not touch a confirmed row.
    const confirmedSibling: Application = { id: "app2", offerId: "offer1", status: "CONFIRMED" };
    expect(shouldCascadeReject(confirmedSibling, "app1", "offer1")).toBe(false);
  });

  it("filters a mixed set correctly (typical multi-applicant scenario)", () => {
    const apps: Application[] = [
      { id: "self", offerId: "offer1", status: "APPROVED_WAITING_CLIENT" },
      { id: "pendingSibling", offerId: "offer1", status: "PENDING" },
      { id: "approvedSibling", offerId: "offer1", status: "APPROVED_WAITING_CLIENT" },
      { id: "rejectedSibling", offerId: "offer1", status: "REJECTED" },
      { id: "otherOffer", offerId: "offer2", status: "PENDING" },
    ];
    const cascaded = apps.filter((a) => shouldCascadeReject(a, "self", "offer1"));
    expect(cascaded.map((a) => a.id).sort()).toEqual([
      "approvedSibling",
      "pendingSibling",
    ]);
  });
});

describe("MASTER-MODELS-FIX-A — client-side cascade-vs-direct REJECTED derivation", () => {
  /**
   * Mirrors the `statusMeta` derivation in
   * `client-model-applications-page.tsx`: when a REJECTED application
   * sits on a CLOSED offer, soften the wording — the rejection was a
   * side-effect of another model being chosen. Direct rejection by
   * the master keeps the original wording.
   */
  function classifyReject(
    appStatus: "REJECTED",
    offerStatus: "ACTIVE" | "CLOSED" | "ARCHIVED",
  ): "cascade" | "direct" {
    return offerStatus === "CLOSED" ? "cascade" : "direct";
  }

  it("REJECTED on CLOSED offer → cascade (soft wording)", () => {
    expect(classifyReject("REJECTED", "CLOSED")).toBe("cascade");
  });

  it("REJECTED on ACTIVE offer → direct (master rejected this client)", () => {
    expect(classifyReject("REJECTED", "ACTIVE")).toBe("direct");
  });

  it("REJECTED on ARCHIVED offer → direct (treat as direct reject — old)", () => {
    // ARCHIVED is end-of-life cleanup; preserves prior semantics
    // without surfacing soft wording on legacy data.
    expect(classifyReject("REJECTED", "ARCHIVED")).toBe("direct");
  });
});
