"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { m, AnimatePresence } from "framer-motion";
import {
  ArrowDownUp,
  Building2,
  Calendar,
  Check,
  Clock,
  House,
  LayoutGrid,
  LogOut,
  Scissors,
  Search,
  User,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMe } from "@/lib/hooks/use-me";
import { useActiveRole, type ActiveRole } from "@/lib/hooks/use-active-role";
import { MOTION, SPRING_SHEET } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { useOverlayA11y } from "@/components/ui/use-modal-a11y";
import { BECOME_MASTER_HREF, shouldOfferBecomeMaster } from "@/lib/auth/available-cabinets";
import { Button } from "@/components/ui/button";
import { BottomTab, BottomTabBar, BottomTabBarSpacer } from "@/components/layout/bottom-tab-bar";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/http/client";

/** NAV-ATTENTION-01 — ответ `GET /api/me/attention`. */
type Attention = { bookings: number; messages: number; reviews: number };
const attentionFetcher = (url: string) => fetchJson<Attention>(url);

const t = UI_TEXT.nav;

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

// ── Tab sets per role ─────────────────────────────────────────────────────────

/**
 * NAV-GUEST-BOOKINGS — у гостя третья вкладка вела на `/book`, а это страница
 * «записаться по фото из ленты»: без `?portfolioId=` она показывает только
 * ошибку, и так было с момента появления вкладки. Теперь вкладка та же, что у
 * клиента («Записи»), через вход с возвратом: после входа панель не
 * перестраивается, а человек попадает туда, куда нажал.
 */
const GUEST_BOOKINGS_HREF = `/login?next=${encodeURIComponent("/cabinet/bookings")}`;

const NAV_GUEST: NavItem[] = [
  { label: t.home, href: "/", icon: House },
  { label: t.catalog, href: "/catalog", icon: Search },
  { label: t.bookings, href: GUEST_BOOKINGS_HREF, icon: Calendar },
  { label: t.loginAction, href: "/login", icon: User },
];

const NAV_CLIENT: NavItem[] = [
  { label: t.home, href: "/", icon: House },
  { label: t.catalog, href: "/catalog", icon: Search },
  { label: t.bookings, href: "/cabinet/bookings", icon: Calendar },
  { label: t.profile, href: "/cabinet/profile", icon: User },
];

const NAV_MASTER: NavItem[] = [
  { label: t.home, href: "/cabinet/master/dashboard", icon: House },
  { label: t.bookings, href: "/cabinet/master/bookings", icon: Calendar },
  { label: t.schedule, href: "/cabinet/master/schedule", icon: Clock },
  { label: t.profile, href: "/cabinet/master/profile", icon: User },
];

const NAV_STUDIO: NavItem[] = [
  { label: t.home, href: "/cabinet/studio", icon: House },
  { label: t.calendar, href: "/cabinet/studio/calendar", icon: Calendar },
  { label: t.clients, href: "/cabinet/studio/clients", icon: User },
  { label: t.services, href: "/cabinet/studio/settings?tab=services", icon: LayoutGrid },
];

const NAV_ADMIN: NavItem[] = [
  { label: t.home, href: "/", icon: House },
  { label: t.adminShort, href: "/admin", icon: LayoutGrid },
  { label: t.catalog, href: "/catalog", icon: Search },
  { label: t.profile, href: "/cabinet/profile", icon: User },
];

// ── Role config ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<ActiveRole, string> = {
  CLIENT: t.roleClient,
  MASTER: t.roleMaster,
  STUDIO: t.roleStudio,
};

const ROLE_HOME: Record<ActiveRole, string> = {
  CLIENT: "/cabinet/profile",
  MASTER: "/cabinet/master/dashboard",
  STUDIO: "/cabinet/studio",
};

// ── Role Switcher Drawer ──────────────────────────────────────────────────────

function RoleSwitcherDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { activeRole, setRole, availableRoles, hasMaster, hasStudio } = useActiveRole();
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetTitleId = useId();

  // UI-13 — модальный bottom-sheet с переключателем ролей, а не «подложка
  // навигации»: в exempt-листе ESLint так классифицирован СКРИМ, и на сам
  // лист классификация не распространялась. Не было ни `role="dialog"`, ни
  // Escape, ни focus-trap, ни блокировки прокрутки фона — Tab уходил на
  // страницу под листом, колесо прокручивало её же. Контракт взят общий,
  // разметка и анимация не тронуты.
  useOverlayA11y({ open, onClose, containerRef: sheetRef });

  const switchTo = (role: ActiveRole) => {
    setRole(role);
    router.push(ROLE_HOME[role]);
    onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <m.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MOTION.micro}
            className="fixed inset-0 z-scrim bg-black/40 backdrop-blur-[2px] lg:hidden"
            onClick={onClose}
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
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-border-subtle" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 pt-1">
              <span id={sheetTitleId} className="text-sm font-semibold text-text-main">{t.roleSwitcherTitle}</span>
              {/* UI-26: `ghost` + `size="icon"` вместо сырого <button> —
                  зона нажатия приходит из UI-29 (40px бокс + after:-inset-1 =
                  46 эффективных), прежние `-m-2 p-3.5` её эмулировали руками.
                  `text-text-sec` в className побеждает `text-text-main` варианта
                  (замер бандла: `.text-text-main` 6041 < `.text-text-sec` 6064),
                  поэтому кнопка остаётся тихой. */}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="-mr-2 text-text-sec hover:text-text-main"
                aria-label={UI_TEXT.common.close}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Role list — only shown if 2+ roles */}
            {availableRoles.length > 1 ? (
              <div className="mx-4 mb-4 space-y-1 rounded-2xl border border-border-subtle bg-bg-input/50 p-2">
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-sec">
                  {t.activeRole}
                </p>
                {availableRoles.map((role) => {
                  const isActive = role === activeRole;
                  const Icon = role === "CLIENT" ? User : role === "MASTER" ? Scissors : Building2;
                  return (
                    <Button
                      key={role}
                      variant="wrapper"
                      size="none"
                      onClick={() => switchTo(role)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 font-medium text-accent-text"
                          : "text-text-sec hover:bg-bg-card hover:text-text-main"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{ROLE_LABELS[role]}</span>
                      {isActive ? <Check className="h-4 w-4 shrink-0" /> : null}
                    </Button>
                  );
                })}
              </div>
            ) : null}

            {/* Add role links */}
            {(!hasMaster || !hasStudio) ? (
              <div className="mx-4 mb-4 space-y-1">
                {!hasMaster ? (
                  <Link
                    href="/cabinet/roles"
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-accent-text transition-colors hover:bg-primary/5"
                  >
                    <UserPlus className="h-4 w-4 shrink-0" />
                    {t.becomeMasterCta}
                  </Link>
                ) : null}
                {!hasStudio ? (
                  <Link
                    href="/cabinet/roles"
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-accent-text transition-colors hover:bg-primary/5"
                  >
                    <Building2 className="h-4 w-4 shrink-0" />
                    {t.createStudioCta}
                  </Link>
                ) : null}
              </div>
            ) : null}

            {/* Logout */}
            <div className="mx-4 mb-5 border-t border-border-subtle/60 pt-3">
              <a
                href="/logout"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-text-sec transition-colors hover:bg-bg-input hover:text-text-main"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {UI_TEXT.nav.logout}
              </a>
            </div>
          </m.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

// ── Main BottomNav ────────────────────────────────────────────────────────────

/**
 * AUTH-GATE-01 — `authEnabled` is resolved server-side in the root layout
 * (`resolveAuthMethods().any`) and passed down, because the underlying flags
 * are server-only. Defaults to `true` so any caller that forgets it keeps the
 * pre-gate behaviour rather than silently losing the login tab.
 */
export function BottomNav({ authEnabled = true }: { authEnabled?: boolean }) {
  const pathname = usePathname();
  const { user } = useMe();
  const { activeRole, availableRoles, hydrated } = useActiveRole();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const isAdmin = user?.roles?.includes("ADMIN") || user?.roles?.includes("SUPERADMIN");
  const isGuest = !user;
  const isLoggedIn = Boolean(user);

  const items = useMemo<NavItem[]>(() => {
    if (isAdmin) return NAV_ADMIN;
    // AUTH-GATE-01: guests lose the login-backed tabs («Войти», «Записи» —
    // the latter goes through /login too) when no login method is available.
    if (isGuest) {
      return authEnabled ? NAV_GUEST : NAV_GUEST.filter((item) => !item.href.startsWith("/login"));
    }
    if (!hydrated) return NAV_CLIENT; // default while hydrating

    if (activeRole === "MASTER") return NAV_MASTER;
    if (activeRole === "STUDIO") return NAV_STUDIO;
    return NAV_CLIENT;
  }, [isAdmin, isGuest, hydrated, activeRole, authEnabled]);

  const hiddenPrefixes = ["/auth", "/login", "/logout", "/book"];
  const isHidden = hiddenPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  // Inside the master/studio/client cabinets their own bottom navs are
  // rendered; hide the global one so they don't overlap. The client cabinet
  // is the rest of the /cabinet subtree (its (user) route group is invisible
  // in the URL — /cabinet, /cabinet/bookings, …), EXCEPT /cabinet/billing,
  // which sits outside that group and relies on this global nav on mobile.
  const isInsideMaster = pathname.startsWith("/cabinet/master");
  const isInsideStudio = pathname.startsWith("/cabinet/studio");
  const isCabinetBillingFallback =
    pathname === "/cabinet/billing" || pathname.startsWith("/cabinet/billing/");
  const isInsideClientCabinet =
    (pathname === "/cabinet" || pathname.startsWith("/cabinet/")) &&
    !isInsideMaster &&
    !isInsideStudio &&
    !isCabinetBillingFallback;
  // NAV-ATTENTION-01: числа «ждёт действия» — только у вошедшего клиента и
  // только там, где панель видна (в кабинетах свои панели со своими числами).
  const navHidden = isHidden || isInsideMaster || isInsideStudio || isInsideClientCabinet;
  const attentionKey =
    isLoggedIn && !isAdmin && hydrated && activeRole === "CLIENT" && !navHidden ? "/api/me/attention" : null;
  const { data: attention } = useSWR<Attention>(attentionKey, attentionFetcher, {
    dedupingInterval: 30_000,
  });

  if (navHidden) return null;

  const showSwitcher = isLoggedIn && availableRoles.length > 1;
  // NAV-BECOME-MASTER-01: у клиента без кабинета пятый слот — «Стать мастером».
  // Тот же слот с первым кабинетом занимает переключатель кабинетов, так что
  // кнопка уходит сама. До гидратации ролей не показываем: иначе у мастера
  // на первом кадре мелькнула бы кнопка создания кабинета.
  const showBecomeMaster =
    isLoggedIn && hydrated && !showSwitcher && shouldOfferBecomeMaster(user?.roles ?? []);
  const becomeMasterActive = pathname === BECOME_MASTER_HREF;

  return (
    <>
      <RoleSwitcherDrawer open={switcherOpen} onClose={() => setSwitcherOpen(false)} />

      <BottomTabBar ariaLabel={UI_TEXT.a11y.mainNav}>
        {items.map((item) => {
          const itemPath = item.href.split("?")[0] ?? item.href;
          const isActive =
            pathname === "/" ? itemPath === "/" : pathname.startsWith(itemPath) && itemPath !== "/";
          const isClientBookings = items === NAV_CLIENT && item.href === "/cabinet/bookings";
          const isClientProfile = items === NAV_CLIENT && item.href === "/cabinet/profile";
          return (
            <BottomTab
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={isActive}
              badge={isClientBookings ? attention?.bookings ?? 0 : 0}
              dot={isClientProfile && ((attention?.messages ?? 0) > 0 || (attention?.reviews ?? 0) > 0)}
              dotLabel={t.needsAttention}
            />
          );
        })}

        {/* Role switcher tab — only when user has multiple roles */}
        {showSwitcher ? (
          <BottomTab
            onClick={() => setSwitcherOpen(true)}
            expanded={switcherOpen}
            icon={ArrowDownUp}
            label={ROLE_LABELS[activeRole]}
            ariaLabel={t.switchRole}
          />
        ) : null}

        {/* NAV-ALIGN-01: обычная вкладка, как соседние. Бренд-кружок и полная
            подпись делали её вдвое шире остальных (97px против 56 на 375px)
            и самой громкой точкой панели — предложение, а не навигация,
            перекрикивало навигацию. Полное имя — в aria-label. */}
        {showBecomeMaster ? (
          <BottomTab
            href={BECOME_MASTER_HREF}
            icon={Scissors}
            label={t.becomeMasterTabShort}
            ariaLabel={t.becomeMasterCta}
            active={becomeMasterActive}
          />
        ) : null}
      </BottomTabBar>
      <BottomTabBarSpacer />
    </>
  );
}
