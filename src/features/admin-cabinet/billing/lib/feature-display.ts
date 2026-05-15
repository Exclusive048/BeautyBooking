import { SubscriptionScope } from "@prisma/client";
import { FEATURE_CATALOG, type FeatureKey } from "@/lib/billing/feature-catalog";
import type { PlanFeatures } from "@/lib/billing/features";
import type { AdminPlanFeatureLine } from "@/features/admin-cabinet/billing/types";

/**
 * Renders a list of human-readable feature lines for a plan card.
 * Iterates the catalog (so ordering follows `uiOrder`), filters by
 * `appliesTo`, and emits one line per:
 *   - boolean feature that is enabled (value === true)
 *   - limit feature with a non-null cap (value: "Записей: 50")
 *
 * Disabled booleans and "unlimited" limits (value === null) are
 * omitted — they aren't selling points, no value in the card.
 *
 * Pure function: doesn't fetch features itself; caller passes the
 * already-resolved `PlanFeatures` (typically from
 * `resolveEffectiveFeatures` against the full plans map).
 */
export function planFeatureLines(
  features: PlanFeatures,
  scope: SubscriptionScope,
): AdminPlanFeatureLine[] {
  const scopeWord =
    scope === SubscriptionScope.STUDIO ? "STUDIO" : "MASTER";

  const entries = (Object.keys(FEATURE_CATALOG) as FeatureKey[])
    .map((key) => [key, FEATURE_CATALOG[key]] as const)
    .filter(([, def]) => def.appliesTo === "BOTH" || def.appliesTo === scopeWord)
    .filter(([, def]) => def.status === "active")
    .sort((a, b) => a[1].uiOrder - b[1].uiOrder);

  const lines: AdminPlanFeatureLine[] = [];
  for (const [key, def] of entries) {
    const raw = (features as Record<string, unknown>)[key];
    if (def.kind === "boolean") {
      if (raw === true) {
        lines.push({ title: def.title, detail: null });
      }
    } else if (def.kind === "limit") {
      if (typeof raw === "number") {
        lines.push({
          title: def.title,
          detail: new Intl.NumberFormat("ru-RU").format(raw),
        });
      }
      // raw === null means "unlimited" — skip, as it's not a card
      // selling point ("безлимитно" might be valuable in marketing
      // but here we keep cards quiet).
    }
  }
  return lines;
}
