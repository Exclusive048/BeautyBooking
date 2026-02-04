"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  userLabel: string;
};

export function AuthUserMenu({ userLabel }: Props) {
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
        className="cursor-pointer rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {userLabel}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border bg-white p-2 shadow-lg">
          <Link href="/cabinet/client/bookings" className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-50" onClick={closeMenu}>
            {UI_TEXT.nav.myBookings}
          </Link>
          <Link href="/cabinet/client/profile" className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-50" onClick={closeMenu}>
            {UI_TEXT.nav.profile}
          </Link>
          <Link href="/cabinet" className="block rounded-lg px-3 py-2 text-sm hover:bg-neutral-50" onClick={closeMenu}>
            {UI_TEXT.nav.myCabinet}
          </Link>
          <div className="mt-1 border-t pt-2" onClick={closeMenu}>
            <LogoutButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}
