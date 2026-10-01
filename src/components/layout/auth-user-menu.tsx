"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ChevronDown, User, Settings, Shield, LogIn, Briefcase, Building2, UserCircle2, Check } from "lucide-react";
import { AnchoredPortal } from "@/components/ui/anchored-portal";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/components/logout-button";
import type { CabinetKind } from "@/lib/auth/available-cabinets";
import {
  CABINET_URLS,
  detectCurrentCabinet,
  hasProfessionalCabinet,
} from "@/lib/auth/available-cabinets";
import { DISTANCE, MOTION } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  userLabel: string;
  showAdminLink: boolean;
  /**
   * Cabinets the user can access. Order matters — drives the dropdown.
   * Empty array hides the switcher entirely (legacy guests, fallback).
   */
  availableCabinets?: CabinetKind[];
  /**
   * NAV-BECOME-MASTER-01 — «Стать мастером» вынесено в шапку (слот ярлыков
   * кабинетов, `topbar.tsx`). Пока оно там, пункт `/cabinet/roles` в этом
   * меню не дублируется; с первым кабинетом он возвращается как «Мои кабинеты».
   */
  offerBecomeMaster?: boolean;
};

const CABINET_ICON: Record<CabinetKind, typeof UserCircle2> = {
  user: UserCircle2,
  master: Briefcase,
  studio: Building2,
};

const CABINET_LABEL: Record<CabinetKind, string> = {
  user: UI_TEXT.nav.cabinetSwitcher.client,
  master: UI_TEXT.nav.cabinetSwitcher.master,
  studio: UI_TEXT.nav.cabinetSwitcher.studio,
};

export function AuthUserMenu({
  userLabel,
  showAdminLink,
  availableCabinets = [],
  offerBecomeMaster = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname() ?? "/";
  const currentCabinet = detectCurrentCabinet(pathname);
  const showSwitcher = availableCabinets.length > 1;
  // PWA-FIX-08 — один и тот же пункт ведёт в `/cabinet/roles`, но называется по
  // назначению: без профессионального кабинета это вход в СОЗДАНИЕ («Стать
  // мастером»), с кабинетом — список уже имеющихся («Мои кабинеты»). Прежняя
  // единственная подпись «Мои кабинеты» у клиента без роли обещала то, чего за
  // ней нет.
  const professionalLabel = hasProfessionalCabinet(availableCabinets)
    ? UI_TEXT.nav.professionalRoles
    : UI_TEXT.nav.becomeMaster;

  const closeMenu = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      {/* UI-26: это буквально `secondary` — рамка + `bg-bg-input` + inset-блик +
          `hover:bg-bg-card` + то же фокус-кольцо, только собранные вручную.
          Отличия после миграции ратифицированы как выравнивание на систему:
          рамка `border-control` вместо `border-subtle/80` (UI-09 — альфа
          композитится с заливкой и съедает контраст), альфа блика 0.25 → 0.28,
          у фокус-кольца появляется offset. `size="none"` — потому что свои
          `px-3 py-2` уже дают нужную высоту шапки; `gap` НЕ переопределяем:
          `.gap-1\.5` (3108) идёт раньше `.gap-2` (3120), то есть база всё равно
          победила бы, и класс в атрибуте только врал бы про результат. */}
      <Button
        variant="secondary"
        size="none"
        className="cursor-pointer px-3 py-2 text-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={UI_TEXT.nav.userMenuAria}
      >
        <span className="max-w-[120px] truncate">{userLabel}</span>
        <m.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={MOTION.micro}
          className="text-text-sec"
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </m.span>
      </Button>

      {/* 29.09 доработки · 21: меню — порталом (`z-popover`). Внутри шапки
          (`sticky` + `backdrop-blur`) оно жило на уровне шапки и уходило под
          нижнюю навигацию и cookie-уведомление, несмотря на `z-[100]`. */}
      <AnchoredPortal open={open} anchorRef={rootRef} onDismiss={closeMenu} align="end">
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, scale: 0.95, y: -DISTANCE.nudge }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -DISTANCE.nudge, transition: MOTION.exit }}
            transition={MOTION.micro}
            className="w-64 rounded-3xl border border-border-subtle/80 bg-bg-card/95 p-2 shadow-hover backdrop-blur"
          >
            {showSwitcher ? (
              <div className="space-y-0.5 pb-1">
                <div className="px-3 py-1.5 eyebrow">
                  {UI_TEXT.nav.cabinetSwitcher.label}
                </div>
                {availableCabinets.map((c) => {
                  const Icon = CABINET_ICON[c];
                  const isActive = c === currentCabinet;
                  return (
                    <Link
                      key={c}
                      href={CABINET_URLS[c]}
                      onClick={closeMenu}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? "bg-bg-input text-text-main"
                          : "text-text-main hover:bg-bg-input"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
                      <span className="flex-1">{CABINET_LABEL[c]}</span>
                      {isActive ? (
                        <Check className="h-4 w-4 text-accent-text" aria-hidden />
                      ) : null}
                    </Link>
                  );
                })}
                <div className="my-1 border-t border-border-subtle/60" />
              </div>
            ) : null}
            <div className="space-y-0.5">
              <Link
                href="/cabinet/profile"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
                onClick={closeMenu}
              >
                <User className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
                {UI_TEXT.nav.profile}
              </Link>
              {offerBecomeMaster ? null : (
                <Link
                  href="/cabinet/roles"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
                  onClick={closeMenu}
                >
                  <LogIn className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
                  {professionalLabel}
                </Link>
              )}
              <Link
                href="/cabinet/settings"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
                onClick={closeMenu}
              >
                <Settings className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
                {UI_TEXT.nav.settings}
              </Link>
              {showAdminLink ? (
                <Link
                  href="/admin"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
                  onClick={closeMenu}
                >
                  <Shield className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
                  {UI_TEXT.nav.adminPanel}
                </Link>
              ) : null}
            </div>
            <div className="mt-1 border-t border-border-subtle/60 pt-1" onClick={closeMenu}>
              <LogoutButton variant="ghost" className="w-full justify-start rounded-xl px-3 text-sm" />
            </div>
          </m.div>
        )}
      </AnimatePresence>
      </AnchoredPortal>
    </div>
  );
}
