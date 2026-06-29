// Single source of truth for the "upgrade plan" CTA target.
//
// FIX-26 (PLAN-GATE-CTA-BROKEN): plan-gate CTAs used to link to bare
// `/cabinet/billing`, which `cabinet/billing/page.tsx` redirects to
// `/cabinet/profile` when no `?scope=` is present — dead-ending a user who
// wants to pay. Every gate's CTA now routes through this helper so the target
// is scope-correct (master surface → master billing, studio surface → studio
// billing) and never diverges again. `scope` follows the SURFACE, not the
// user (a user who is both master and studio gets the studio target from a
// studio surface and the master target from a master surface).
//
// `/cabinet/{master,studio}/billing` render `<BillingPage scope=… />` directly
// (no `?scope=` dependency) — they are the canonical billing entry points.
//
// Pure module, zero imports → safe to import from client components
// (no server-only transitive deps — see CLAUDE.md rule 13).

export type BillingScope = "MASTER" | "STUDIO";

export function billingUpgradeHref(scope: BillingScope): string {
  return scope === "STUDIO" ? "/cabinet/studio/billing" : "/cabinet/master/billing";
}
