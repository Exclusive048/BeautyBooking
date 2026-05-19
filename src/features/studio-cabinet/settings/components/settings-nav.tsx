"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertOctagon,
  Bell,
  Building2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioSettingsSection } from "../lib/types";

const T = UI_TEXT.studioCabinet.settingsV2.nav;

type Props = {
  active: StudioSettingsSection;
  canDanger: boolean;
};

const SECTIONS: Array<{
  key: StudioSettingsSection;
  labelKey: keyof typeof T;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}> = [
  { key: "general", labelKey: "general", icon: Building2 },
  { key: "owner-team", labelKey: "ownerTeam", icon: Users },
  { key: "notifications", labelKey: "notifications", icon: Bell },
  { key: "policy", labelKey: "policy", icon: ShieldCheck },
  { key: "danger", labelKey: "danger", icon: AlertOctagon },
];

export function SettingsNav({ active, canDanger }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const select = (key: StudioSettingsSection) => {
    const next = new URLSearchParams(searchParams.toString());
    if (key === "general") next.delete("section");
    else next.set("section", key);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return (
    <aside className="rounded-2xl border border-border-subtle bg-bg-card p-3 lg:sticky lg:top-[calc(var(--topbar-h)+1rem)]">
      <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {T.sectionsLabel}
      </p>
      <ul className="space-y-1">
        {SECTIONS.map((item) => {
          if (item.key === "danger" && !canDanger) return null;
          const Icon = item.icon;
          const isActive = active === item.key;
          const isDanger = item.key === "danger";
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => select(item.key)}
                aria-pressed={isActive}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                  isActive
                    ? isDanger
                      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : "bg-primary/10 text-primary"
                    : isDanger
                      ? "text-rose-700/80 hover:bg-rose-50/60 dark:text-rose-400/80 dark:hover:bg-rose-950/30"
                      : "text-text-main hover:bg-bg-input/60",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{T[item.labelKey]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
