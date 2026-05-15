"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, LogOut, Scissors, User } from "lucide-react";
import { FocalImage } from "@/components/ui/focal-image";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  /** Display name shown in the chip + dropdown header. */
  name: string;
  /** Optional avatar; falls back to monogram. */
  avatarUrl: string | null;
  /** Whether this user owns a Master cabinet — when false, the
   * «Switch to Master» row is hidden. */
  hasMasterCabinet: boolean;
};

const T = UI_TEXT.studioCabinet.userChip;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

/**
 * Bottom-of-sidebar user chip with a dropdown menu. Differs from
 * `MasterUserChip` (info-only card) by exposing a role-switcher and
 * logout action — the studio admin needs an explicit way back to the
 * platform profile or, if applicable, to the master cabinet.
 *
 * If the user lacks a master cabinet (`hasMasterCabinet: false`), the
 * switch row is omitted entirely. The symmetric switcher on the master
 * side is not yet wired — tracked in BACKLOG as a follow-up.
 */
export function StudioUserChip({ name, avatarUrl, hasMasterCabinet }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!wrapperRef.current.contains(target)) setOpen(false);
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 border-t border-border-subtle px-4 py-3 text-left transition-colors",
          open ? "bg-bg-input/60" : "hover:bg-bg-input/40",
        )}
      >
        {avatarUrl ? (
          <FocalImage
            src={avatarUrl}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-input text-xs font-semibold text-text-sec ring-1 ring-border-subtle"
          >
            {initialsOf(name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-main">{name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-text-sec">
            <Building2 className="h-3 w-3 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{T.currentContext}</span>
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-text-sec transition-transform",
            open ? "rotate-180" : "",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+8px)] left-3 right-3 z-30 rounded-2xl border border-border-subtle bg-bg-card/95 p-2 shadow-card backdrop-blur"
        >
          {hasMasterCabinet ? (
            <Link
              href="/cabinet/master"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-main transition-colors hover:bg-bg-input"
              role="menuitem"
            >
              <Scissors className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
              <span>{T.switchToMaster}</span>
            </Link>
          ) : null}
          <Link
            href="/cabinet"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-main transition-colors hover:bg-bg-input"
            role="menuitem"
          >
            <User className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
            <span>{T.profile}</span>
          </Link>
          <div className="my-1 border-t border-border-subtle" aria-hidden />
          <Link
            href="/logout"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-main transition-colors hover:bg-bg-input"
            role="menuitem"
          >
            <LogOut className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
            <span>{T.logout}</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
