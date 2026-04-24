"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, Scissors, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { UI_TEXT } from "@/lib/ui/text";
import { FocalImage } from "@/components/ui/focal-image";

type WorkspaceMenuLink = {
  href: string;
  label: string;
  ariaLabel: string;
  avatarUrl: string | null;
  avatarFocalX?: number | null;
  avatarFocalY?: number | null;
  fallbackIcon: string;
};

type Props = {
  userLabel: string;
  showAdminLink: boolean;
  masterWorkspace: WorkspaceMenuLink | null;
  studioWorkspace: WorkspaceMenuLink | null;
  isGuest?: boolean;
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
          <FocalImage
            src={item.avatarUrl}
            alt=""
            focalX={item.avatarFocalX}
            focalY={item.avatarFocalY}
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

const NAV_LINKS = [
  { href: "/catalog", label: UI_TEXT.nav.catalog },
  { href: "/hot", label: UI_TEXT.nav.hotSlots },
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
}: Props) {
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
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 90 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center"
            >
              <X className="h-5 w-5" aria-hidden />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ opacity: 0, rotate: 90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: -90 }}
              transition={{ duration: 0.15 }}
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
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
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
                <Button asChild className="w-full" size="sm">
                  <Link href="/login" onClick={closeMenu}>{UI_TEXT.auth.login}</Link>
                </Button>
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
