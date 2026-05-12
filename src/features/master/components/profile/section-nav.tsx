"use client";

import { Check, Image as ImageIcon, Layers, MapPin, Pencil, Phone, User } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { ProfileSectionId } from "@/lib/master/profile-completion";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.profile;

type Props = {
  bySection: Record<ProfileSectionId, boolean>;
};

const ITEMS: Array<{ id: ProfileSectionId; icon: typeof User; label: string }> = [
  { id: "header", icon: User, label: T.nav.header },
  { id: "contacts", icon: Phone, label: T.nav.contacts },
  { id: "about", icon: Pencil, label: T.nav.about },
  { id: "location", icon: MapPin, label: T.nav.location },
  { id: "services", icon: Layers, label: T.nav.services },
  { id: "portfolio", icon: ImageIcon, label: T.nav.portfolio },
];

const ROOT_MARGIN = "-30% 0px -55% 0px";

/**
 * Vertical section nav with two responsibilities:
 *   1. Anchor links — clicking jumps to the section via URL hash.
 *   2. Active state — IntersectionObserver watches the on-page section
 *      cards and highlights whichever is currently in the upper third
 *      of the viewport. SSR fallback: first item starts active.
 *
 * Per-row checkmark mirrors the completion calculator. Edge case: if a
 * section has nothing visible (e.g. a long Services list scrolls past
 * the trigger), the IO threshold is loose enough that the next section
 * still picks up the active state when its top reaches ~30% from top.
 */
export function SectionNav({ bySection }: Props) {
  const [activeId, setActiveId] = useState<ProfileSectionId>("header");

  useEffect(() => {
    const targets = ITEMS.map((item) => ({
      id: item.id,
      element: document.getElementById(`profile-${item.id}`),
    })).filter((entry): entry is { id: ProfileSectionId; element: HTMLElement } => Boolean(entry.element));

    if (targets.length === 0) return;

    const visibility = new Map<ProfileSectionId, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id.replace("profile-", "") as ProfileSectionId;
          visibility.set(id, entry.intersectionRatio);
        }
        let topMost: ProfileSectionId | null = null;
        let bestRatio = 0;
        for (const item of ITEMS) {
          const ratio = visibility.get(item.id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            topMost = item.id;
          }
        }
        if (topMost) setActiveId(topMost);
      },
      { rootMargin: ROOT_MARGIN, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    for (const target of targets) observer.observe(target.element);
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="rounded-2xl border border-border-subtle bg-bg-card p-2">
      <p className="px-2 pb-2 pt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {T.sidebar.sectionsHeading}
      </p>
      <ul className="space-y-0.5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeId === item.id;
          const isComplete = Boolean(bySection[item.id]);
          return (
            <li key={item.id}>
              <a
                href={`#profile-${item.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-text-main hover:bg-bg-input"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{item.label}</span>
                {isComplete ? (
                  <Check
                    className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300"
                    aria-hidden
                  />
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
