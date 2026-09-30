"use client";

import { Eye, EyeOff, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/cn";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { DismissLayer } from "@/components/ui/dismiss-layer";

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
  const toast = useToast();
  const { confirm, modal: confirmModal } = useConfirm();
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
      await fetchJsonWithAuth<unknown>(baseUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !isEnabled }),
      });
      router.refresh();
    } catch (error) {
      toast.error(serverMessageOr(error, errorTexts.errorUpdate));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setOpen(false);
    const ok = await confirm({
      message: errorTexts.confirmDelete,
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetchJsonWithAuth<unknown>(baseUrl, { method: "DELETE" });
      router.refresh();
    } catch (error) {
      // У поверхности своя, более точная строка для записей на услуге —
      // проверяется до общего решения (FIX-C8).
      if (itemType === "service" && error instanceof ApiClientError && error.code === "SERVICE_HAS_BOOKINGS") {
        toast.error(SERVICE_T.errorHasBookings);
      } else {
        toast.error(serverMessageOr(error, errorTexts.errorDelete));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <Button variant="wrapper"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={ROW_T.menuAria}
        disabled={busy}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-sec transition-colors hover:bg-bg-input hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <MoreVertical className="h-3.5 w-3.5" aria-hidden />
      </Button>
      {open ? (
        <>
          <DismissLayer label={UI_TEXT.a11y.closeMenu} onDismiss={() => setOpen(false)} className="z-10" />
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
      {confirmModal}
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
      <Button variant="wrapper"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-input",
          destructive ? "text-danger-text" : "text-text-main"
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {label}
      </Button>
    </li>
  );
}
