"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AlertOctagon, Bell, Images, ShieldCheck, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";
import {
  DEFAULT_STUDIO_SETTINGS_SECTION,
  type StudioSettingsSection,
} from "../lib/types";
import { Button } from "@/components/ui/button";

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
  { key: "profile", labelKey: "profile", icon: UserRound },
  { key: "portfolio", labelKey: "portfolio", icon: Images },
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
    if (key === DEFAULT_STUDIO_SETTINGS_SECTION) next.delete("section");
    else next.set("section", key);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return (
    <aside className="rounded-2xl border border-border-subtle bg-bg-card p-3 lg:sticky lg:top-[calc(var(--topbar-h)+1rem)]">
      <p className="mb-2 px-2 eyebrow">
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
              <Button variant="wrapper"
                onClick={() => select(item.key)}
                aria-pressed={isActive}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                  isActive
                    ? isDanger
                      ? "bg-danger-surface text-danger-text"
                      : "bg-primary/10 text-accent-text"
                    : isDanger
                      ? "text-danger-text hover:bg-danger-surface"
                      : "text-text-main hover:bg-bg-input/60",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{T[item.labelKey]}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
