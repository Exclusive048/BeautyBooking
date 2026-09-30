"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Clock,
  User,
  MoreHorizontal,
  Users,
  Star,
  BarChart3,
  Settings,
  ExternalLink,
  CreditCard,
  Sparkles,
  SlidersHorizontal,
  Bell,
  MessageSquare,
  X,
  type LucideIcon,
} from "lucide-react";
import { m, AnimatePresence } from "framer-motion";
import { BottomTab, BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { useOverlayA11y } from "@/components/ui/use-modal-a11y";
import { cn } from "@/lib/cn";
import { MOTION, SPRING_SHEET } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { Button } from "@/components/ui/button";

const t = UI_TEXT.master.bookingsPage;
const tNav = UI_TEXT.master.topbar.nav;
// Подписи разделов те же, что в десктопном сайдбаре (`MasterSidebar`) — один
// раздел не должен называться по-разному на двух носителях.
const tItems = UI_TEXT.cabinetMaster.nav.items;

type TabItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const TABS: TabItem[] = [
  { href: "/cabinet/master/dashboard", label: tNav.home, icon: LayoutDashboard, exact: true },
  { href: "/cabinet/master/bookings", label: tNav.bookings, icon: Calendar },
  { href: "/cabinet/master/schedule", label: tNav.schedule, icon: Clock },
  { href: "/cabinet/master/profile", label: tNav.profile, icon: User },
];

/**
 * PWA-FIX-04 — лист «Ещё» несёт ВСЕ разделы десктопного сайдбара, у которых нет
 * своей вкладки. До этого «Настройки расписания», «Уведомления» и «Сообщения»
 * жили только в `MasterSidebar` (`lg:` и шире): с телефона / из PWA мастер не
 * мог настроить график вообще — единственный вход был условной ссылкой в блоке
 * «Требует внимания» на дашборде. Паритет держит `master-nav-parity.test.ts`.
 */
type AttentionKey = "notifications" | "messages" | "reviews";

const MORE_ITEMS: Array<{ href: string; label: string; icon: LucideIcon; attentionKey?: AttentionKey }> = [
  { href: "/cabinet/master/schedule/settings", label: tItems.scheduleSettings, icon: SlidersHorizontal },
  { href: "/cabinet/master/notifications", label: tItems.notifications, icon: Bell, attentionKey: "notifications" },
  { href: "/cabinet/master/messages", label: tItems.messages, icon: MessageSquare, attentionKey: "messages" },
  { href: "/cabinet/master/clients", label: t.menuClients, icon: Users },
  { href: "/cabinet/master/model-offers", label: t.menuModels, icon: Sparkles },
  { href: "/cabinet/master/reviews", label: t.menuReviews, icon: Star, attentionKey: "reviews" },
  { href: "/cabinet/master/analytics", label: t.menuAnalytics, icon: BarChart3 },
  { href: "/cabinet/master/billing", label: t.menuBilling, icon: CreditCard },
  { href: "/cabinet/master/account", label: t.menuSettings, icon: Settings },
];

const MORE_PATHS = MORE_ITEMS.map((item) => item.href);

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  const path = href.split("?")[0] ?? href;
  if (exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function isMoreActive(pathname: string): boolean {
  return MORE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Подсвечена ровно одна вкладка. «Настройки расписания» лежат под
 * `/schedule/*`, но живут в листе «Ещё»: без этого правила на них горели и
 * «Расписание», и «Ещё» — два индикатора с общим `layoutId` (как `profileActive`
 * у студии).
 */
export function isMasterTabActive(pathname: string, href: string, exact?: boolean): boolean {
  return !isMoreActive(pathname) && isActive(pathname, href, exact);
}

type Props = {
  /** Optional badge count rendered on the Bookings tab — pending master actions. */
  pendingBookingsCount?: number;
  /**
   * NAV-ATTENTION-01 — счётчики разделов из листа «Ещё»: число у пункта листа
   * и точка на самой вкладке «Ещё», пока хоть что-то внутри ждёт действия.
   */
  attention?: Record<AttentionKey, number>;
};

const NO_ATTENTION: Record<AttentionKey, number> = { notifications: 0, messages: 0, reviews: 0 };

export function MasterBottomNav({ pendingBookingsCount = 0, attention = NO_ATTENTION }: Props = {}) {
  const pathname = usePathname();
  const moreActive = isMoreActive(pathname);
  const moreNeedsAttention = MORE_ITEMS.some((item) => item.attentionKey && attention[item.attentionKey] > 0);
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


  return (
    <>
      {/* More drawer */}
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
                <span id={sheetTitleId} className="text-sm font-semibold text-text-main">{t.moreDrawerTitle}</span>
                <Button variant="wrapper"
                  onClick={() => setMoreOpen(false)}
                  className="-m-2 rounded-lg p-3.5 text-text-sec hover:text-text-main"
                  aria-label={UI_TEXT.common.close}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1 px-4 pb-6 pt-1">
                {MORE_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  const count = item.attentionKey ? attention[item.attentionKey] : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "relative flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-center transition-colors",
                        active ? "bg-primary/10 text-accent-text" : "text-text-sec hover:bg-bg-input"
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                      <span className="text-[11px] font-medium leading-tight">{item.label}</span>
                      {count > 0 ? (
                        <span
                          aria-hidden
                          className="absolute right-2 top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground"
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
                <Link
                  href="/cabinet/master/settings/public"
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-center text-text-sec transition-colors hover:bg-bg-input"
                >
                  <ExternalLink className="h-5 w-5" aria-hidden />
                  <span className="text-[11px] font-medium leading-tight">{t.menuMyPage}</span>
                </Link>
              </div>
            </m.div>
          </>
        ) : null}
      </AnimatePresence>

      {/* NAV-ALIGN-01 — разметка панели общая (`BottomTabBar`): высота,
          подложка и вид вкладки одинаковы во всех кабинетах. Зазора в потоке
          здесь нет — его держит `pb-` у `<main>` шелла (флекс в ряд, спейсер
          был бы инертен, см. `master-cabinet-shell.tsx`). */}
      <BottomTabBar ariaLabel={UI_TEXT.a11y.mainNav}>
        {TABS.map((tab) => (
          <BottomTab
            key={tab.href}
            href={tab.href}
            icon={tab.icon}
            label={tab.label}
            active={isMasterTabActive(pathname, tab.href, tab.exact)}
            badge={tab.href === "/cabinet/master/bookings" ? pendingBookingsCount : 0}
          />
        ))}
        <BottomTab
          onClick={() => setMoreOpen(true)}
          expanded={moreOpen}
          icon={MoreHorizontal}
          label={tNav.more}
          active={moreActive || moreOpen}
          dot={moreNeedsAttention}
          dotLabel={UI_TEXT.nav.needsAttention}
        />
      </BottomTabBar>
    </>
  );
}
