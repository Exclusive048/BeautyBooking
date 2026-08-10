"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X, type LucideIcon } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  STUDIO_NAV,
  isStudioNavItemActive,
  type StudioNavBadgeKey,
  type StudioNavItem,
} from "@/features/studio-cabinet/config/studio-nav";
import type { StudioSidebarCounts } from "@/features/studio-cabinet/server/sidebar-counts.service";
import { useOverlayA11y } from "@/components/ui/use-modal-a11y";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  counts: StudioSidebarCounts;
};

const T = UI_TEXT.studioCabinet;

const PRIMARY_TAB_IDS = ["dashboard", "schedule", "schedule-requests", "masters"] as const;

function flatNavItems(): StudioNavItem[] {
  return STUDIO_NAV.flatMap((group) => group.items);
}

function pickPrimaryTabs(): StudioNavItem[] {
  const flat = flatNavItems();
  return PRIMARY_TAB_IDS.map((id) => flat.find((item) => item.id === id)).filter(
    (item): item is StudioNavItem => Boolean(item),
  );
}

function pickMoreItems(): StudioNavItem[] {
  const primaryIds = new Set<string>(PRIMARY_TAB_IDS);
  return flatNavItems().filter((item) => !primaryIds.has(item.id));
}

function badgeValue(
  counts: StudioSidebarCounts,
  badgeKey: StudioNavBadgeKey | undefined,
): number {
  if (!badgeKey) return 0;
  return counts[badgeKey];
}

function NavTab({
  item,
  badge,
  active,
}: {
  item: StudioNavItem;
  badge: number;
  active: boolean;
}) {
  const Icon: LucideIcon = item.icon;
  const label = T.nav.items[item.labelKey];
  return (
    <Link
      href={item.href}
      className="relative flex flex-col items-center gap-0.5 px-1 py-2.5 transition-colors"
      aria-current={active ? "page" : undefined}
    >
      <span className="relative">
        <Icon
          className={cn("h-5 w-5", active ? "text-accent-text" : "text-text-sec")}
          aria-hidden
        />
        {badge > 0 ? (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "text-[10px] font-medium",
          active ? "text-accent-text" : "text-text-sec",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

export function StudioBottomNav({ counts }: Props) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetTitleId = useId();

  // UI-13 — это модальный bottom-sheet с интерактивным содержимым, а не
  // «подложка навигации»: в exempt-листе ESLint так классифицирован СКРИМ,
  // и классификация на сам лист не распространялась. У него не было ни
  // `role="dialog"`, ни Escape, ни focus-trap, ни блокировки прокрутки
  // фона — то есть Tab уходил в страницу под листом, а колесо прокручивало
  // её же. Контракт взят общий, разметка и анимация не тронуты.
  useOverlayA11y({ open: moreOpen, onClose: () => setMoreOpen(false), containerRef: sheetRef });

  const reduce = useReducedMotion();

  const primary = pickPrimaryTabs();
  const more = pickMoreItems();
  const moreActive = more.some((item) => isStudioNavItemActive(pathname, item));

  return (
    <>
      <AnimatePresence>
        {moreOpen ? (
          <>
            <motion.div
              key="overlay"
              initial={reduce ? false : { opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.18 }}
              className="fixed inset-0 z-[49] bg-black/40 backdrop-blur-[2px] lg:hidden"
              onClick={() => setMoreOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              key="drawer"
              initial={reduce ? false : { y: "100%" }}
              animate={reduce ? { y: 0 } : { y: 0 }}
              exit={reduce ? { y: "100%" } : { y: "100%" }}
              transition={reduce ? { duration: 0 } : { type: "spring", damping: 30, stiffness: 340 }}
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetTitleId}
              tabIndex={-1}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] border-t border-border-subtle bg-bg-card shadow-2xl lg:hidden"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-border-subtle" />
              </div>
              <div className="flex items-center justify-between px-5 pb-3 pt-1">
                <span id={sheetTitleId} className="text-sm font-semibold text-text-main">
                  {T.bottomNav.moreTitle}
                </span>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  className="-m-2 rounded-lg p-3.5 text-text-sec hover:text-text-main"
                  aria-label={T.bottomNav.close}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 px-4 pb-6 pt-1">
                {more.map((item) => {
                  const Icon = item.icon;
                  const active = isStudioNavItemActive(pathname, item);
                  const badge = badgeValue(counts, item.badgeKey);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "relative flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-center transition-colors",
                        active
                          ? "bg-primary/10 text-accent-text"
                          : "text-text-sec hover:bg-bg-input",
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                      <span className="text-[11px] font-medium leading-tight">
                        {T.nav.items[item.labelKey]}
                      </span>
                      {badge > 0 ? (
                        <span
                          aria-hidden
                          className="absolute right-2 top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white"
                        >
                          {badge > 9 ? "9+" : badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label={T.nav.ariaLabel}
      >
        <div className="border-t border-border-subtle bg-bg-card/90 backdrop-blur-xl">
          <ul className="flex items-stretch">
            {primary.map((item) => {
              const active = isStudioNavItemActive(pathname, item);
              const badge = badgeValue(counts, item.badgeKey);
              return (
                <li key={item.id} className="flex-1">
                  <NavTab item={item} badge={badge} active={active} />
                </li>
              );
            })}
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="flex w-full flex-col items-center gap-0.5 px-1 py-2.5 transition-colors"
                aria-expanded={moreOpen}
              >
                <MoreHorizontal
                  className={cn(
                    "h-5 w-5",
                    moreActive || moreOpen ? "text-accent-text" : "text-text-sec",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    moreActive || moreOpen ? "text-accent-text" : "text-text-sec",
                  )}
                >
                  {T.bottomNav.more}
                </span>
              </button>
            </li>
          </ul>
        </div>
      </nav>
      <div className="h-16 lg:hidden" aria-hidden="true" />
    </>
  );
}
