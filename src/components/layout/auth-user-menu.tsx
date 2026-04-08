"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, User, Settings, Shield, LogIn } from "lucide-react";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  userLabel: string;
  showAdminLink: boolean;
};

export function AuthUserMenu({ userLabel, showAdminLink }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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
            className="absolute right-0 z-[100] mt-2 w-56 rounded-3xl border border-border-subtle/80 bg-bg-card/95 p-2 shadow-hover backdrop-blur"
          >
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
