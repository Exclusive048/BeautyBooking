"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Lock, ChevronDown, Sparkles, Bell, Zap, BarChart3, CreditCard, Users, Image, Wallet, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FEATURE_CATALOG, type FeatureKey } from "@/lib/billing/feature-catalog";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import { UI_TEXT } from "@/lib/ui/text";

type Scope = "MASTER" | "STUDIO";

type Props = {
  scope: Scope;
  billingHref: string;
};

// ── Group metadata (icon + order) ────────────────────────────────────────────

type GroupMeta = { icon: React.ElementType; order: number };

const GROUP_META: Record<string, GroupMeta> = {
  Бронирование:   { icon: Clock,     order: 1 },
  Каталог:        { icon: Sparkles,  order: 2 },
  Профиль:        { icon: Image,     order: 3 },
  Уведомления:    { icon: Bell,      order: 4 },
  "Горячие слоты":{ icon: Zap,       order: 5 },
  Аналитика:      { icon: BarChart3, order: 6 },
  Платежи:        { icon: CreditCard,order: 7 },
  Клиенты:        { icon: Users,     order: 8 },
  Лимиты:         { icon: Wallet,    order: 9 },
};

function groupOrder(group: string): number {
  return GROUP_META[group]?.order ?? 99;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type FeatureItem = {
  key: FeatureKey;
  title: string;
  description: string;
  enabled: boolean;
  planned?: boolean;
};

type FeatureGroup = {
  group: string;
  icon: React.ElementType;
  items: FeatureItem[];
};

function buildGroups(
  features: Record<string, boolean | number | null> | null,
  scope: Scope
): FeatureGroup[] {
  const map = new Map<string, FeatureItem[]>();

  const sorted = (Object.keys(FEATURE_CATALOG) as FeatureKey[]).sort(
    (a, b) => FEATURE_CATALOG[a].uiOrder - FEATURE_CATALOG[b].uiOrder
  );

  for (const key of sorted) {
    const def = FEATURE_CATALOG[key];
    if (def.appliesTo !== "BOTH" && def.appliesTo !== scope) continue;

    const raw = features?.[key];
    let enabled: boolean;

    if (def.kind === "limit") {
      enabled = raw !== 0 && raw !== null && raw !== undefined;
    } else {
      enabled = Boolean(raw);
    }

    // Mark SMS/Max/VK as planned (not yet implemented at delivery level)
    const planned = key === "smsNotifications" || key === "maxNotifications";

    if (!map.has(def.group)) map.set(def.group, []);
    map.get(def.group)!.push({ key, title: def.title, description: def.description, enabled, planned });
  }

  return Array.from(map.entries())
    .map(([group, items]) => ({
      group,
      icon: GROUP_META[group]?.icon ?? Sparkles,
      items,
    }))
    .sort((a, b) => groupOrder(a.group) - groupOrder(b.group));
}

// ── Feature row ───────────────────────────────────────────────────────────────

function FeatureRow({
  item,
  billingHref,
}: {
  item: FeatureItem;
  billingHref: string;
}) {
  const t = UI_TEXT.billing.paywall;

  if (item.planned) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 opacity-50">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-input">
          <Clock className="h-3 w-3 text-text-sec" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-sm text-text-main">{item.title}</span>
          <p className="text-xs text-text-sec">{item.description}</p>
        </div>
        <Badge className="shrink-0 text-[10px]">
          {t.soonBadge}
        </Badge>
      </div>
    );
  }

  if (!item.enabled) {
    return (
      <Link
        href={billingHref}
        className="group flex items-center gap-3 px-4 py-3 opacity-50 transition-opacity hover:opacity-70"
        title={t.lockedTooltip}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-input">
          <Lock className="h-3 w-3 text-text-sec" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-sm text-text-main">{item.title}</span>
          <p className="text-xs text-text-sec">{item.description}</p>
        </div>
        <span className="shrink-0 text-[11px] text-primary underline-offset-2 group-hover:underline">
          PRO
        </span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
        <Check className="h-3 w-3 text-emerald-500" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-text-main">{item.title}</span>
        <p className="text-xs text-text-sec">{item.description}</p>
      </div>
    </div>
  );
}

// ── Group accordion ───────────────────────────────────────────────────────────

function FeatureGroupCard({
  group,
  billingHref,
}: {
  group: FeatureGroup;
  billingHref: string;
}) {
  const [open, setOpen] = useState(true);
  const { icon: GroupIcon } = group;
  const activeCount = group.items.filter((i) => i.enabled && !i.planned).length;
  const totalCount = group.items.filter((i) => !i.planned).length;
  const t = UI_TEXT.billing.paywall;

  return (
    <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-bg-input/40"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <GroupIcon className="h-4 w-4 text-primary" aria-hidden />
        </span>
        <span className="flex-1 text-sm font-semibold text-text-main">{group.group}</span>
        <span className="mr-2 text-xs text-text-sec">
          {t.activeCount(activeCount, totalCount)}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-text-sec" aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-border-subtle/60 border-t border-border-subtle/60">
              {group.items.map((item) => (
                <FeatureRow key={item.key} item={item} billingHref={billingHref} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FeaturesPageClient({ scope, billingHref }: Props) {
  const plan = usePlanFeatures(scope);
  const t = UI_TEXT.billing.featuresPage;

  const features = plan.features as Record<string, boolean | number | null> | null;
  const groups = buildGroups(features, scope);

  const planName = plan.tier ?? "FREE";
  const allUnlocked = plan.tier === "PREMIUM";

  if (plan.loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-bg-card" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Plan badge */}
      <div className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="flex-1">
          <p className="text-sm font-semibold text-text-main">{t.planBadge(planName)}</p>
          {allUnlocked && (
            <p className="text-xs text-emerald-500">{t.allUnlocked}</p>
          )}
        </div>
        {!allUnlocked && (
          <Button asChild size="sm" variant="primary">
            <Link href={billingHref}>{t.upgradeCta}</Link>
          </Button>
        )}
      </div>

      {/* Feature groups */}
      <div className="space-y-3">
        {groups.map((group) => (
          <FeatureGroupCard key={group.group} group={group} billingHref={billingHref} />
        ))}
      </div>
    </div>
  );
}
