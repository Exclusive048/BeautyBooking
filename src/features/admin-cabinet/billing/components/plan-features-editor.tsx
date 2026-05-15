"use client";

import { useMemo, useState } from "react";
import type { SubscriptionScope } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import {
  FEATURE_CATALOG,
  type BooleanFeatureKey,
  type FeatureKey,
  type LimitFeatureKey,
} from "@/lib/billing/feature-catalog";
import {
  canDisableFeature,
  deriveUiState,
  isRelaxedLimit,
  type FeatureUiState,
  type PlanFeatureOverrides,
  type PlanNode,
} from "@/lib/billing/features";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminPlanInheritanceCandidate } from "@/features/admin-cabinet/billing/types";

const T = UI_TEXT.adminPanel.billing;
const TF = T.features;

type CatalogEntry = readonly [FeatureKey, (typeof FEATURE_CATALOG)[FeatureKey]];

type Props = {
  /** id of the plan under edit. `parseOverrides` is applied upstream
   * so we receive a clean overrides object. */
  planId: string;
  scope: SubscriptionScope;
  inheritsFromPlanId: string | null;
  overrides: PlanFeatureOverrides;
  onChange: (next: PlanFeatureOverrides) => void;
  /** All other plans in the system — used to resolve the parent's
   * effective features for inheritance hints + relaxed-limit checks. */
  allPlans: AdminPlanInheritanceCandidate[];
};

/** Match the legacy filter: scope-applicable + currently-active.
 * `planned` features are visible in the catalog source but hidden from
 * the editor — they aren't yet enforced anywhere in runtime code. */
function filterCatalog(scope: SubscriptionScope): CatalogEntry[] {
  const scopeWord = scope === ("STUDIO" as SubscriptionScope) ? "STUDIO" : "MASTER";
  return (Object.entries(FEATURE_CATALOG) as CatalogEntry[])
    .filter(([, def]) => def.appliesTo === "BOTH" || def.appliesTo === scopeWord)
    .filter(([, def]) => def.status === "active")
    .sort((a, b) => a[1].uiOrder - b[1].uiOrder);
}

function groupCatalog(entries: CatalogEntry[]): Array<readonly [string, CatalogEntry[]]> {
  const groups = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const group = entry[1].group;
    const list = groups.get(group) ?? [];
    list.push(entry);
    groups.set(group, list);
  }
  return Array.from(groups.entries());
}

/** Builds the in-memory plans map used by `resolveEffectiveFeatures`.
 * We overlay the draft overrides + draft inheritance for the plan
 * under edit so the inheritance hints update live as the admin edits. */
function buildPlanNodes(
  planId: string,
  draftInheritsFromPlanId: string | null,
  draftOverrides: PlanFeatureOverrides,
  candidates: AdminPlanInheritanceCandidate[],
): Map<string, PlanNode> {
  const map = new Map<string, PlanNode>();
  for (const plan of candidates) {
    map.set(plan.id, {
      id: plan.id,
      inheritsFromPlanId: plan.inheritsFromPlanId,
      features: plan.rawFeatures,
    });
  }
  map.set(planId, {
    id: planId,
    inheritsFromPlanId: draftInheritsFromPlanId,
    features: draftOverrides,
  });
  return map;
}

export function PlanFeaturesEditor({
  planId,
  scope,
  inheritsFromPlanId,
  overrides,
  onChange,
  allPlans,
}: Props) {
  const [query, setQuery] = useState("");
  const [limitErrors, setLimitErrors] = useState<Record<string, string | null>>({});

  const planNodes = useMemo(
    () => buildPlanNodes(planId, inheritsFromPlanId, overrides, allPlans),
    [planId, inheritsFromPlanId, overrides, allPlans],
  );

  const uiState = useMemo(
    () => deriveUiState(planId, planNodes),
    [planId, planNodes],
  );

  /** Parent's effective limits — only computed when the plan has a
   * parent. Used by the limit input for the relaxed check. `undefined`
   * for a key means "no constraint" (root plan / no parent). */
  const parentEffective = useMemo(() => {
    if (!inheritsFromPlanId) return {} as Record<string, unknown>;
    const parentNodes = new Map(planNodes);
    // Resolve as if the plan being edited didn't exist — only its
    // chain. `resolveEffectiveFeatures` walks upward from the given
    // id, so calling with the parent id gives us the parent's
    // effective features cleanly.
    const result: Record<string, unknown> = {};
    const state = deriveUiState(inheritsFromPlanId, parentNodes);
    for (const key of Object.keys(state) as FeatureKey[]) {
      result[key] = state[key].effectiveValue;
    }
    return result;
  }, [inheritsFromPlanId, planNodes]);

  const catalogEntries = useMemo(() => filterCatalog(scope), [scope]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = useMemo(() => {
    if (!normalizedQuery) return catalogEntries;
    return catalogEntries.filter(([key, def]) => {
      const haystack = `${def.title} ${def.description} ${def.group} ${key}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [catalogEntries, normalizedQuery]);

  const groupedCatalog = useMemo(() => groupCatalog(filteredEntries), [filteredEntries]);

  const plansById = useMemo(
    () => new Map(allPlans.map((p) => [p.id, p])),
    [allPlans],
  );

  const setBoolean = (key: BooleanFeatureKey, checked: boolean) => {
    const next: PlanFeatureOverrides = { ...overrides };
    if (checked) {
      next[key] = true;
    } else {
      delete next[key];
    }
    onChange(next);
  };

  const setLimit = (key: LimitFeatureKey, value: number | null | undefined) => {
    if (value === undefined) {
      // remove the override — fall back to parent / base
      const next = { ...overrides } as Record<string, unknown>;
      delete next[key];
      setLimitErrors((curr) => ({ ...curr, [key]: null }));
      onChange(next as PlanFeatureOverrides);
      return;
    }
    const parentValue = parentEffective[key] as number | null | undefined;
    if (!isRelaxedLimit(parentValue, value)) {
      setLimitErrors((curr) => ({ ...curr, [key]: TF.limitStricter }));
      return;
    }
    setLimitErrors((curr) => ({ ...curr, [key]: null }));
    onChange({ ...overrides, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder={TF.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
        />
        <div className="text-xs text-text-sec">
          {TF.shownCount.replace("{count}", String(filteredEntries.length))}
        </div>
      </div>

      {groupedCatalog.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-bg-input/40 px-4 py-6 text-sm text-text-sec">
          {TF.nothingFound}
        </div>
      ) : null}

      <div className="space-y-6">
        {groupedCatalog.map(([groupName, entries], groupIndex) => (
          <section
            key={groupName}
            className={cn(
              "space-y-3",
              groupIndex > 0 ? "border-t border-border-subtle/60 pt-5" : "",
            )}
          >
            <h4 className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
              {groupName}
            </h4>
            <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
              {entries.map(([key, def]) => {
                const state = uiState[key];
                if (!state) return null;
                return def.kind === "boolean" ? (
                  <BooleanFeatureRow
                    key={key}
                    featureKey={key as BooleanFeatureKey}
                    title={def.title}
                    description={def.description}
                    state={state}
                    plansById={plansById}
                    onToggle={setBoolean}
                  />
                ) : (
                  <LimitFeatureRow
                    key={key}
                    featureKey={key as LimitFeatureKey}
                    title={def.title}
                    description={def.description}
                    state={state}
                    parentValue={parentEffective[key] as number | null | undefined}
                    overrideValue={
                      overrides[key as LimitFeatureKey] as number | null | undefined
                    }
                    plansById={plansById}
                    error={limitErrors[key] ?? null}
                    onChange={setLimit}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function inheritedFromLabel(
  state: FeatureUiState,
  plansById: Map<string, AdminPlanInheritanceCandidate>,
): string {
  if (!state.inheritedFromPlanId) return TF.inheritedFromBase;
  const parent = plansById.get(state.inheritedFromPlanId);
  if (!parent) return TF.inheritedFromBase;
  return TF.inheritedFrom.replace("{planCode}", parent.code);
}

function BooleanFeatureRow({
  featureKey,
  title,
  description,
  state,
  plansById,
  onToggle,
}: {
  featureKey: BooleanFeatureKey;
  title: string;
  description: string;
  state: FeatureUiState;
  plansById: Map<string, AdminPlanInheritanceCandidate>;
  onToggle: (key: BooleanFeatureKey, checked: boolean) => void;
}) {
  const checked = state.effectiveValue === true;
  const disabled = !canDisableFeature(featureKey, state);
  const isInheritedOn = state.isInherited && checked;

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border border-border-subtle/60 px-3 py-2.5",
        disabled ? "opacity-90" : "",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-main">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-text-sec">{description}</p>
        ) : null}
        {isInheritedOn ? (
          <p className="mt-1 text-[11px] text-text-sec">
            {inheritedFromLabel(state, plansById)} · {TF.cannotDisableInherited}
          </p>
        ) : state.isOverridden ? (
          <p className="mt-1 text-[11px] text-text-sec">
            {TF.overriddenForPlan}
          </p>
        ) : null}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onToggle(featureKey, value)}
      />
    </div>
  );
}

function LimitFeatureRow({
  featureKey,
  title,
  description,
  state,
  parentValue,
  overrideValue,
  plansById,
  error,
  onChange,
}: {
  featureKey: LimitFeatureKey;
  title: string;
  description: string;
  state: FeatureUiState;
  parentValue: number | null | undefined;
  overrideValue: number | null | undefined;
  plansById: Map<string, AdminPlanInheritanceCandidate>;
  error: string | null;
  onChange: (key: LimitFeatureKey, value: number | null | undefined) => void;
}) {
  const effectiveValue = state.effectiveValue as number | null;
  // "Unlimited" check: explicit override === null, or no override and
  // effective resolves to null.
  const isUnlimited =
    overrideValue === null ||
    (overrideValue === undefined && effectiveValue === null);
  // Locked: parent says unlimited (null) and there's no local override
  // — child can't tighten an unlimited parent.
  const isLocked = parentValue === null && overrideValue === undefined;

  const inputValue =
    overrideValue === null
      ? ""
      : overrideValue !== undefined
        ? String(overrideValue)
        : effectiveValue === null
          ? ""
          : String(effectiveValue);

  const hint = isLocked
    ? TF.limitInheritedLocked
    : parentValue !== undefined
      ? TF.limitOnlyRelaxParent
      : null;

  const inheritedHint =
    state.isInherited && !state.isOverridden
      ? inheritedFromLabel(state, plansById)
      : null;

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border border-border-subtle/60 px-3 py-2.5 md:col-span-2",
        isLocked ? "opacity-90" : "",
      )}
    >
      <div>
        <p className="text-sm font-medium text-text-main">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-text-sec">{description}</p>
        ) : null}
        {inheritedHint ? (
          <p className="mt-1 text-[11px] text-text-sec">{inheritedHint}</p>
        ) : null}
        {hint ? (
          <p className="mt-1 text-[11px] text-text-sec">{hint}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="number"
          min={0}
          step={1}
          value={inputValue}
          disabled={isUnlimited || isLocked}
          onChange={(event) => {
            const raw = event.target.value;
            if (!raw) {
              onChange(featureKey, undefined);
              return;
            }
            const num = Number(raw);
            if (!Number.isFinite(num)) return;
            onChange(featureKey, Math.trunc(num));
          }}
          className="w-28"
        />
        <label className="flex items-center gap-2 text-xs text-text-sec">
          <Switch
            checked={isUnlimited}
            disabled={isLocked}
            onCheckedChange={(checked) =>
              onChange(featureKey, checked ? null : undefined)
            }
          />
          <span>{TF.unlimited}</span>
        </label>
        {error ? (
          <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
        ) : null}
      </div>
    </div>
  );
}
