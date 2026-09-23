"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X, Scissors, Building2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/components/logout-button";
import type { CabinetKind } from "@/lib/auth/available-cabinets";
import { BECOME_MASTER_HREF, hasProfessionalCabinet } from "@/lib/auth/available-cabinets";
import { UI_TEXT } from "@/lib/ui/text";
import { ResilientImage } from "@/components/ui/resilient-image";

type WorkspaceMenuLink = {
  href: string;
  label: string;
  ariaLabel: string;
  avatarUrl: string | null;
  fallbackIcon: string;
};

type Props = {
  userLabel: string;
  showAdminLink: boolean;
  masterWorkspace: WorkspaceMenuLink | null;
  studioWorkspace: WorkspaceMenuLink | null;
  isGuest?: boolean;
  /**
   * PWA-FIX-08 — кабинеты, доступные по РОЛЯМ. Нужны ровно для подписи пункта
   * `/cabinet/roles`: без профессионального кабинета он называется «Стать
   * мастером», с кабинетом — «Мои кабинеты». Предикат общий с десктопным меню
   * (`hasProfessionalCabinet`), иначе две поверхности разъехались бы в подписи
   * одного пункта. Пустой массив (гость, забывший вызов) → «Стать мастером»:
   * это же и верно для того, у кого роли нет.
   */
  availableCabinets?: CabinetKind[];
  /**
   * NAV-BECOME-MASTER-01 — клиент без кабинета: «Стать мастером» встаёт
   * карточкой в слот кабинетов (туда, где потом появятся «Кабинет
   * мастера» / «Кабинет студии»), а не строкой среди «Профиль / Настройки».
   * Значение считает `topbar.tsx` тем же предикатом, что и кнопку в шапке.
   */
  offerBecomeMaster?: boolean;
  /**
   * AUTH-GATE-01 — server-resolved `resolveAuthMethods().any`. Only affects the
   * guest branch: with no login method available the «Вход» CTA is dropped.
   * Defaults to `true` so the signed-in menu and any missed call site are
   * unaffected.
   */
  authEnabled?: boolean;
};

function WorkspaceMenuItem({
  item,
  onClick,
  isStudio,
}: {
  item: WorkspaceMenuLink;
  onClick: () => void;
  isStudio?: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-label={item.ariaLabel}
      className="flex items-center gap-3 rounded-2xl border border-border-subtle/80 bg-bg-input px-3 py-2.5 text-sm font-medium text-text-main transition hover:bg-bg-card"
      onClick={onClick}
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle/80 bg-bg-card text-text-sec">
        {item.avatarUrl ? (
          <ResilientImage
            src={item.avatarUrl}
            alt=""
            width={32}
            height={32}
            className="rounded-full object-cover"
          />
        ) : isStudio ? (
          <Building2 className="h-4 w-4" aria-hidden />
        ) : (
          <Scissors className="h-4 w-4" aria-hidden />
        )}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

// "Горящие окошки" intentionally removed from the menu — see 07-NAVBAR-FOOTER.
// Page /hot and the /api/hot-slots API stay live; only the menu entry is hidden.
const NAV_LINKS = [
  { href: "/catalog", label: UI_TEXT.nav.catalog },
  { href: "/models", label: UI_TEXT.nav.forModels },
  { href: "/cabinet/bookings", label: UI_TEXT.nav.myBookings },
  { href: "/pricing", label: UI_TEXT.nav.pricing },
];

export function AuthMobileMenu({
  userLabel,
  showAdminLink,
  masterWorkspace,
  studioWorkspace,
  isGuest = false,
  availableCabinets = [],
  offerBecomeMaster = false,
  authEnabled = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();
  const professionalLabel = hasProfessionalCabinet(availableCabinets)
    ? UI_TEXT.nav.professionalRoles
    : UI_TEXT.nav.becomeMaster;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative md:hidden">
      <Button
        variant="secondary"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? UI_TEXT.nav.closeMenu : UI_TEXT.nav.openMenu}
        className="h-10 w-10"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={reduce ? false : { opacity: 0, rotate: -90 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, rotate: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: 90 }}
              transition={reduce ? { duration: 0 } : { duration: 0.15 }}
              className="flex items-center justify-center"
            >
              <X className="h-5 w-5" aria-hidden />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={reduce ? false : { opacity: 0, rotate: 90 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, rotate: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, rotate: -90 }}
              transition={reduce ? { duration: 0 } : { duration: 0.15 }}
              className="flex items-center justify-center"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </motion.span>
          )}
        </AnimatePresence>
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.95, y: -8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -8 }}
            transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="absolute right-0 z-[100] mt-2 w-[min(88vw,320px)] rounded-3xl border border-border-subtle/80 bg-bg-card/95 p-2 shadow-hover backdrop-blur"
          >
            {!isGuest && (
              <div className="rounded-2xl bg-bg-input px-3 py-2">
                <div className="text-xs text-text-sec">{UI_TEXT.nav.mobileMenuTitle}</div>
                <div className="text-sm font-semibold text-text-main">{userLabel}</div>
              </div>
            )}

            {!isGuest && (masterWorkspace ?? studioWorkspace) && (
              <div className="mt-2 space-y-2">
                {masterWorkspace ? (
                  <WorkspaceMenuItem item={masterWorkspace} onClick={closeMenu} />
                ) : null}
                {studioWorkspace ? (
                  <WorkspaceMenuItem item={studioWorkspace} onClick={closeMenu} isStudio />
                ) : null}
              </div>
            )}

            {!isGuest && offerBecomeMaster ? (
              <div className="mt-2">
                {/* NAV-ALIGN-01: тот же вид, что у ярлыков кабинетов
                    (`WorkspaceMenuItem`), которые встанут на это место после
                    создания кабинета. Бренд-заливка и градиентный кружок делали
                    пункт самым громким в меню — громче навигации. */}
                <Link
                  href={BECOME_MASTER_HREF}
                  className="flex items-center gap-3 rounded-2xl border border-border-subtle/80 bg-bg-input px-3 py-2.5 text-sm font-medium text-text-main transition hover:bg-bg-card"
                  onClick={closeMenu}
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-subtle/80 bg-bg-card text-accent-text">
                    <Scissors className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="flex-1">{UI_TEXT.nav.becomeMaster}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
                </Link>
              </div>
            ) : null}

            <div className="mt-2 space-y-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-xl px-3 py-2 text-sm text-text-sec transition hover:bg-bg-input hover:text-text-main"
                  onClick={closeMenu}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="my-2 border-t border-border-subtle/60" />

            {isGuest ? (
              <div className="space-y-2 px-1 pb-1">
                {/* AUTH-GATE-01: no login method available → no «Вход» CTA. */}
                {authEnabled ? (
                  <Button asChild className="w-full" size="sm">
                    <Link href="/login" onClick={closeMenu}>{UI_TEXT.auth.login}</Link>
                  </Button>
                ) : null}
                <Button asChild variant="secondary" className="w-full" size="sm">
                  <Link href="/become-master" onClick={closeMenu}>{UI_TEXT.nav.becomeMaster}</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Link
                    href="/cabinet/profile"
                    className="block rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
                    onClick={closeMenu}
                  >
                    {UI_TEXT.nav.profile}
                  </Link>
                  {/* PWA-FIX-01: единственный путь к профессиональным ролям на
                      мобильном. Ссылка была ТОЛЬКО в десктопном <AuthUserMenu>,
                      а второй вход — bottom-sheet переключателя ролей — требует
                      `availableRoles.length > 1`, то есть у клиента без кабинета
                      он не рендерится вовсе, и внутри /cabinet глобальный
                      <BottomNav> скрыт в пользу <CabinetBottomNav>. Итог: с
                      телефона кабинет мастера/студии было не создать. Позиция
                      зеркалит десктоп (профиль → роли → настройки).
                      NAV-BECOME-MASTER-01: у клиента без кабинета этот вход
                      — карточка вверху меню, здесь не дублируется. */}
                  {offerBecomeMaster ? null : (
                    <Link
                      href="/cabinet/roles"
                      className="block rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
                      onClick={closeMenu}
                    >
                      {professionalLabel}
                    </Link>
                  )}
                  <Link
                    href="/cabinet/settings"
                    className="block rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
                    onClick={closeMenu}
                  >
                    {UI_TEXT.nav.settings}
                  </Link>
                  {showAdminLink ? (
                    <Link
                      href="/admin"
                      className="block rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
                      onClick={closeMenu}
                    >
                      {UI_TEXT.nav.adminPanel}
                    </Link>
                  ) : null}
                </div>
                <div className="mt-1 border-t border-border-subtle/80 pt-2" onClick={closeMenu}>
                  <LogoutButton variant="ghost" className="w-full justify-start rounded-xl px-3 text-sm" />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
