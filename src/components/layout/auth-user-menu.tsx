"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, User, Settings, Shield, LogIn, Briefcase, Building2, UserCircle2, Check } from "lucide-react";
import { LogoutButton } from "@/features/auth/components/logout-button";
import type { CabinetKind } from "@/lib/auth/available-cabinets";
import { CABINET_URLS, detectCurrentCabinet } from "@/lib/auth/available-cabinets";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  userLabel: string;
  showAdminLink: boolean;
  /**
   * Cabinets the user can access. Order matters — drives the dropdown.
   * Empty array hides the switcher entirely (legacy guests, fallback).
   */
  availableCabinets?: CabinetKind[];
};

const CABINET_ICON: Record<CabinetKind, typeof UserCircle2> = {
  user: UserCircle2,
  master: Briefcase,
  studio: Building2,
};

const CABINET_LABEL: Record<CabinetKind, string> = {
  user: UI_TEXT.clientCabinet.switcher.client,
  master: UI_TEXT.clientCabinet.switcher.master,
  studio: UI_TEXT.clientCabinet.switcher.studio,
};

export function AuthUserMenu({ userLabel, showAdminLink, availableCabinets = [] }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname() ?? "/";
  const currentCabinet = detectCurrentCabinet(pathname);
  const showSwitcher = availableCabinets.length > 1;

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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border border-border-subtle/80 bg-bg-input px-3 py-2 text-sm font-medium text-text-main shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition hover:bg-bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/45"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={UI_TEXT.nav.userMenuAria}
      >
        <span className="max-w-[120px] truncate">{userLabel}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-text-sec"
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            className="absolute right-0 z-[100] mt-2 w-64 rounded-3xl border border-border-subtle/80 bg-bg-card/95 p-2 shadow-hover backdrop-blur"
          >
            {showSwitcher ? (
              <div className="space-y-0.5 pb-1">
                <div className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
                  {UI_TEXT.clientCabinet.switcher.label}
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
                        <Check className="h-4 w-4 text-primary" aria-hidden />
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
              <Link
                href="/cabinet/roles"
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
                onClick={closeMenu}
              >
                <LogIn className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
                {UI_TEXT.nav.professionalRoles}
              </Link>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
