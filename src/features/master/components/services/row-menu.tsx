"use client";

import { Eye, EyeOff, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";

const ROW_T = UI_TEXT.cabinetMaster.servicesPage.row;
const M = UI_TEXT.cabinetMaster.servicesPage.menu;
const SERVICE_T = UI_TEXT.cabinetMaster.servicesPage.service;

type Props = {
  itemId: string;
  itemType: "service" | "bundle";
  isEnabled: boolean;
  onEditClick: () => void;
};

/**
 * Trailing menu — Edit / Toggle enabled / Delete. The toggle and delete
 * actions hit the per-resource endpoints; on a 409 (`SERVICE_HAS_BOOKINGS`)
 * we surface a friendly Russian alert pointing the master at the disable
 * action instead.
 */
export function RowMenu({ itemId, itemType, isEnabled, onEditClick }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const baseUrl =
    itemType === "service"
      ? `/api/master/services/${itemId}`
      : `/api/master/service-packages/${itemId}`;
  const errorTexts = itemType === "service" ? SERVICE_T : UI_TEXT.cabinetMaster.servicesPage.bundle;

  const toggle = async () => {
    if (busy) return;
    setOpen(false);
    setBusy(true);
    try {
      const response = await fetch(baseUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !isEnabled }),
      });
      if (!response.ok) {
        window.alert(errorTexts.errorUpdate);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setOpen(false);
    if (!window.confirm(errorTexts.confirmDelete)) return;
    setBusy(true);
    try {
      const response = await fetch(baseUrl, { method: "DELETE" });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        const code = json?.error?.code;
        if (itemType === "service" && code === "SERVICE_HAS_BOOKINGS") {
          window.alert(SERVICE_T.errorHasBookings);
        } else {
          window.alert(errorTexts.errorDelete);
        }
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={ROW_T.menuAria}
        disabled={busy}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-sec transition-colors hover:bg-bg-input hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <MoreVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="close-menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-border-subtle bg-bg-card py-1 shadow-card">
            <Item
              icon={Pencil}
              label={M.edit}
              onClick={() => {
                setOpen(false);
                onEditClick();
              }}
            />
            <Item
              icon={isEnabled ? EyeOff : Eye}
              label={isEnabled ? M.disable : M.enable}
              onClick={toggle}
            />
            <li className="my-0.5 border-t border-border-subtle" />
            <Item icon={Trash2} label={M.delete} onClick={remove} destructive />
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Item({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-input",
          destructive ? "text-rose-700 dark:text-rose-300" : "text-text-main"
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {label}
      </button>
    </li>
  );
}
