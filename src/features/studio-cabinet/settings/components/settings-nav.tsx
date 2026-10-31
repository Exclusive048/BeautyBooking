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

  // На телефоне разделы — полоса чипов с прокруткой, чтобы раздел начинался
  // сразу под заголовком; с lg — колонка слева.
  return (
    <aside className="min-w-0 lg:sticky lg:top-[calc(var(--topbar-h)+1rem)] lg:rounded-2xl lg:border lg:border-border-subtle lg:bg-bg-card lg:p-3">
      <p className="mb-2 hidden px-2 eyebrow lg:block">
        {T.sectionsLabel}
      </p>
      <ul
        aria-label={T.sectionsLabel}
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {SECTIONS.map((item) => {
          if (item.key === "danger" && !canDanger) return null;
          const Icon = item.icon;
          const isActive = active === item.key;
          const isDanger = item.key === "danger";
          return (
            <li key={item.key} className="shrink-0">
              <Button variant="wrapper"
                onClick={() => select(item.key)}
                aria-pressed={isActive}
                className={cn(
                  "flex w-full items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-left text-sm font-medium transition-colors lg:rounded-xl lg:border-0 lg:py-2",
                  isActive
                    ? isDanger
                      ? "border-danger-border bg-danger-surface text-danger-text"
                      : "border-primary/30 bg-primary/10 text-accent-text"
                    : isDanger
                      ? "border-border-subtle bg-bg-card text-danger-text hover:bg-danger-surface lg:bg-transparent"
                      : "border-border-subtle bg-bg-card text-text-main hover:bg-bg-input/60 lg:bg-transparent",
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
