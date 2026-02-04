"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
        className="cursor-pointer rounded-2xl border border-border-subtle/80 bg-bg-input px-3 py-2 text-sm font-medium text-text-main shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition hover:bg-bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/45"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={UI_TEXT.nav.userMenuAria}
      >
        {userLabel}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-3xl border border-border-subtle/80 bg-bg-card/95 p-2 shadow-hover backdrop-blur">
          <Link
            href="/cabinet/client/bookings"
            className="block rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
            onClick={closeMenu}
          >
            {UI_TEXT.nav.myBookings}
          </Link>
          <Link
            href="/cabinet/client/profile"
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
          <div className="mt-1 border-t pt-2" onClick={closeMenu}>
            <LogoutButton variant="ghost" className="w-full justify-start rounded-xl px-3 text-sm" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
