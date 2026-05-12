"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Copy, MoreVertical, Trash2, type LucideIcon } from "lucide-react";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const isBrowser = typeof document !== "undefined";

const T = UI_TEXT.cabinetMaster.scheduleSettings.week.actionMenu;

type Props = {
  onCopyToWorkdays: () => void;
  onCopyToAll: () => void;
  onClear: () => void;
};

/**
 * Per-day action popover for the Hours-tab weekday rows. Mirrors the
 * schedule-grid booking-card menu (fix-02): the panel renders through
 * `createPortal` to `document.body` so it escapes the row's
 * `overflow-hidden` divide-y container, with `position: fixed`
 * coordinates recomputed on open + on scroll/resize.
 *
 * Three actions:
 *   - Copy to workdays  — applies the source day's shape to every
 *     other workday; off-days untouched
 *   - Copy to all       — applies it to every other day (off-days
 *     included) — produces a uniform week
 *   - Clear day         — destructive, gated by `useConfirm`
 *
 * Copy actions are reversible (the master can simply edit again), so
 * they fire without a prompt; only «Очистить день» asks for
 * confirmation.
 */
export function DayActionMenu({
  onCopyToWorkdays,
  onCopyToAll,
  onClear,
}: Props) {
  const { confirm, modal: confirmModal } = useConfirm();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const MENU_WIDTH = 256;
    let left = rect.right - MENU_WIDTH;
    if (left < 8) left = 8;
    const right = left + MENU_WIDTH;
    if (right > window.innerWidth - 8) {
      left = window.innerWidth - 8 - MENU_WIDTH;
    }
    setCoords({ top: rect.bottom + 4, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onResize = () => reposition();
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, reposition]);

  const handleCopyToWorkdays = () => {
    setOpen(false);
    onCopyToWorkdays();
  };

  const handleCopyToAll = () => {
    setOpen(false);
    onCopyToAll();
  };

  const handleClear = async () => {
    setOpen(false);
    const ok = await confirm({
      title: T.clearConfirmTitle,
      message: T.clearConfirmMessage,
      confirmLabel: T.clearConfirmCta,
      variant: "danger",
    });
    if (ok) onClear();
  };

  const menuContent =
    open && coords ? (
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[9999] w-64 overflow-hidden rounded-xl border border-border-subtle bg-bg-card shadow-card"
        style={{ top: coords.top, left: coords.left }}
        onClick={(event) => event.stopPropagation()}
      >
        <MenuItem icon={Copy} onClick={handleCopyToWorkdays}>
          {T.copyToWorkdays}
        </MenuItem>
        <MenuItem icon={Copy} onClick={handleCopyToAll}>
          {T.copyToAll}
        </MenuItem>
        <div className="border-t border-border-subtle" />
        <MenuItem icon={Trash2} onClick={() => void handleClear()} variant="danger">
          {T.clearDay}
        </MenuItem>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={T.triggerAria}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-input/70 hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>

      {isBrowser && menuContent ? createPortal(menuContent, document.body) : null}

      {confirmModal}
    </>
  );
}

function MenuItem({
  icon: Icon,
  onClick,
  variant = "default",
  children,
}: {
  icon: LucideIcon;
  onClick: () => void;
  variant?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-input/70",
        variant === "danger" ? "text-red-600 dark:text-red-400" : "text-text-main",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </button>
  );
}
