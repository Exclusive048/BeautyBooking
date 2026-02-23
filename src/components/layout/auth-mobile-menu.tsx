"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { UI_TEXT } from "@/lib/ui/text";

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
};

function WorkspaceMenuItem({
  item,
  onClick,
}: {
  item: WorkspaceMenuLink;
  onClick: () => void;
}) {
  return (
    <Link
      href={item.href}
      aria-label={item.ariaLabel}
      className="flex items-center gap-3 rounded-2xl border border-border-subtle/80 bg-bg-input px-3 py-2.5 text-sm font-medium text-text-main transition hover:bg-bg-card"
      onClick={onClick}
    >
      <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border-subtle/80 bg-bg-card text-sm">
        {item.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden>{item.fallbackIcon}</span>
        )}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

export function AuthMobileMenu({
  userLabel,
  showAdminLink,
  masterWorkspace,
  studioWorkspace,
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
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={UI_TEXT.nav.mobileMenuAria}
      >
        <span aria-hidden>{open ? "X" : "|||"}</span>
      </Button>

      {open ? (
        <div className="absolute right-0 z-[100] mt-2 w-[min(88vw,320px)] rounded-3xl border border-border-subtle/80 bg-bg-card/95 p-2 shadow-hover backdrop-blur">
          <div className="rounded-2xl bg-bg-input px-3 py-2">
            <div className="text-xs text-text-sec">{UI_TEXT.nav.mobileMenuTitle}</div>
            <div className="text-sm font-semibold text-text-main">{userLabel}</div>
          </div>

          <div className="mt-2 space-y-2">
            {masterWorkspace ? <WorkspaceMenuItem item={masterWorkspace} onClick={closeMenu} /> : null}
            {studioWorkspace ? <WorkspaceMenuItem item={studioWorkspace} onClick={closeMenu} /> : null}
          </div>

          <div className="mt-2 space-y-1">
            <Link
              href="/cabinet/profile"
              className="block rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
              onClick={closeMenu}
            >
              {UI_TEXT.nav.profile}
            </Link>
            <Link
              href="/cabinet/roles"
              className="block rounded-xl px-3 py-2 text-sm font-medium text-text-main transition hover:bg-bg-input"
              onClick={closeMenu}
            >
              {UI_TEXT.nav.professionalRoles}
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
        </div>
      ) : null}
    </div>
  );
}
