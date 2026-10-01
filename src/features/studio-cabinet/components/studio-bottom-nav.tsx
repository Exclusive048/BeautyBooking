"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, UserRound, X } from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import {
  STUDIO_NAV,
  isStudioNavItemActive,
  type StudioNavBadgeKey,
  type StudioNavItem,
} from "@/features/studio-cabinet/config/studio-nav";
import type { StudioSidebarCounts } from "@/features/studio-cabinet/server/sidebar-counts.service";
import { BottomTab, BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { useOverlayA11y } from "@/components/ui/use-modal-a11y";
import { cn } from "@/lib/cn";
import { MOTION, SPRING_SHEET } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

type Props = {
  counts: StudioSidebarCounts;
};

const T = UI_TEXT.studioCabinet;

// NAV-STUDIO-SETTINGS-TAB (решение владельца 2026-09-23): на панели — «Профиль»
// студии (раздел профиля в настройках) вместо «Заявок». Заявки и остальные
// разделы настроек ушли в «Ещё»; сама «Ещё» получает точку, пока что-то внутри
// ждёт действия. Вкладка названа «Профиль», а не «Настройки»: так её и ищут.
const PRIMARY_TAB_IDS = ["dashboard", "schedule", "masters"] as const;
const PROFILE_TAB_HREF = "/cabinet/studio/settings?section=profile";
const SETTINGS_PATH = "/cabinet/studio/settings";

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


  const primary = pickPrimaryTabs();
  const more = pickMoreItems();
  const profileActive = pathname === SETTINGS_PATH || pathname.startsWith(`${SETTINGS_PATH}/`);
  const moreActive = !profileActive && more.some((item) => isStudioNavItemActive(pathname, item));
  const moreNeedsAttention = more.some((item) => badgeValue(counts, item.badgeKey) > 0);

  return (
    <>
      <AnimatePresence>
        {moreOpen ? (
          <>
            <m.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={MOTION.micro}
              className="fixed inset-0 z-scrim bg-black/40 backdrop-blur-[2px] lg:hidden"
              onClick={() => setMoreOpen(false)}
              aria-hidden="true"
            />
            <m.div
              key="drawer"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={SPRING_SHEET}
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetTitleId}
              tabIndex={-1}
              className="fixed inset-x-0 bottom-0 z-modal rounded-t-[24px] border-t border-border-subtle bg-bg-card shadow-2xl lg:hidden"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-border-subtle" />
              </div>
              <div className="flex items-center justify-between px-5 pb-3 pt-1">
                <span id={sheetTitleId} className="text-sm font-semibold text-text-main">
                  {T.bottomNav.moreTitle}
                </span>
                <Button variant="wrapper"
                  onClick={() => setMoreOpen(false)}
                  className="-m-2 rounded-lg p-3.5 text-text-sec hover:text-text-main"
                  aria-label={T.bottomNav.close}
                >
                  <X className="h-4 w-4" />
                </Button>
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
                      <span className="text-2xs font-medium leading-tight">
                        {T.nav.items[item.labelKey]}
                      </span>
                      {badge > 0 ? (
                        <span
                          aria-hidden
                          className="absolute right-2 top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-3xs font-semibold text-white"
                        >
                          {badge > 9 ? "9+" : badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </m.div>
          </>
        ) : null}
      </AnimatePresence>

      {/* NAV-ALIGN-01 — разметка панели общая (`BottomTabBar`), как у
          кабинетов мастера и клиента. Зазор под панелью держит `pb-` у
          `<main>` в `studio/layout.tsx` — шелл флекс в ряд, спейсер инертен. */}
      <BottomTabBar ariaLabel={T.nav.ariaLabel}>
        {primary.map((item) => (
          <BottomTab
            key={item.id}
            href={item.href}
            icon={item.icon}
            label={T.nav.items[item.labelKey]}
            active={isStudioNavItemActive(pathname, item)}
            badge={badgeValue(counts, item.badgeKey)}
          />
        ))}
        <BottomTab href={PROFILE_TAB_HREF} icon={UserRound} label={T.bottomNav.profile} active={profileActive} />
        <BottomTab
          onClick={() => setMoreOpen(true)}
          expanded={moreOpen}
          icon={MoreHorizontal}
          label={T.bottomNav.more}
          active={moreActive || moreOpen}
          dot={moreNeedsAttention}
          dotLabel={UI_TEXT.nav.needsAttention}
        />
      </BottomTabBar>
    </>
  );
}
