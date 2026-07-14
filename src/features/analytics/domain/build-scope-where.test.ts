import { describe, it, expect } from "vitest";
import { buildScopeWhere } from "@/features/analytics/domain/helpers";
import type { AnalyticsContext } from "@/features/analytics/domain/guards";

function ctx(overrides: Partial<AnalyticsContext>): AnalyticsContext {
  return {
    scope: "STUDIO",
    providerId: "prov-1",
    studioId: "studio-1",
    studioProviderId: "prov-1",
    masterFilterId: null,
    timeZone: "Asia/Yekaterinburg",
    ...overrides,
  };
}

describe("buildScopeWhere — HARDENING-05 tenant scope", () => {
  it("MASTER scope → scoped to the master's OWN provider only (never platform-wide)", () => {
    const where = buildScopeWhere(ctx({ scope: "MASTER", providerId: "master-9", studioId: null }));
    expect(where).toEqual({
      OR: [
        { masterProviderId: "master-9" },
        { masterProviderId: null, providerId: "master-9" },
      ],
    });
    // Regression guard for the leak: no match-all clause exists, so a foreign
    // provider's booking (different masterProviderId/providerId) cannot match.
    const serialised = JSON.stringify(where);
    expect(serialised).not.toContain("studioId");
    expect(where.OR?.some((clause) => Object.keys(clause).length === 0)).toBe(false);
  });

  it("STUDIO scope (studioId set, no master filter) → byte-identical to pre-fix OR", () => {
    const where = buildScopeWhere(ctx({ scope: "STUDIO", studioId: "studio-1", providerId: "prov-1" }));
    expect(where).toEqual({ OR: [{ studioId: "studio-1" }, { providerId: "prov-1" }] });
  });

  it("STUDIO scope + masterFilterId → studio scope AND the chosen master (preserved)", () => {
    const where = buildScopeWhere(
      ctx({ scope: "STUDIO", studioId: "studio-1", providerId: "prov-1", masterFilterId: "m-7" }),
    );
    expect(where).toEqual({
      AND: [
        { OR: [{ studioId: "studio-1" }, { providerId: "prov-1" }] },
        { masterProviderId: "m-7" },
      ],
    });
  });

  it("🔴 STUDIO scope with a null studioId → provider-scoped, NEVER a match-all `{}` in the OR", () => {
    // resolveAnalyticsContext never produces this today (STUDIO always has a
    // studioId), but the type allows it — the defensive fix must not emit
    // `{ studioId: undefined }` → `{}` → platform-wide leak.
    const where = buildScopeWhere(ctx({ scope: "STUDIO", studioId: null, providerId: "prov-1" }));
    expect(where).toEqual({ providerId: "prov-1" });
    expect(where.OR).toBeUndefined();
    expect(JSON.stringify(where)).not.toContain("studioId");
  });

  it("never serialises `{ studioId: undefined }` inside any OR (footgun pin)", () => {
    for (const scope of ["MASTER", "STUDIO"] as const) {
      const set = JSON.stringify(buildScopeWhere(ctx({ scope, studioId: "studio-1" })));
      const nullStudio = JSON.stringify(buildScopeWhere(ctx({ scope, studioId: null })));
      // A dropped-key match-all would show as `[{},` — assert it never appears.
      expect(set).not.toContain("[{}");
      expect(nullStudio).not.toContain("[{}");
    }
  });
});
