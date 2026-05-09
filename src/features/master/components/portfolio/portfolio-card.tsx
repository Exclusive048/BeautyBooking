"use client";

/* eslint-disable @next/next/no-img-element */
import { Eye, EyeOff, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type {
  PortfolioCategoryOption,
  PortfolioItemView,
  PortfolioServiceOption,
  PortfolioTagOption,
} from "@/lib/master/portfolio-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { EditItemModal } from "./modals/edit-item-modal";
import { ReorderControls } from "./reorder-controls";

const T = UI_TEXT.cabinetMaster.portfolioPage.card;
const M = UI_TEXT.cabinetMaster.portfolioPage.menu;

type Props = {
  item: PortfolioItemView;
  isFirst: boolean;
  isLast: boolean;
  categories: PortfolioCategoryOption[];
  services: PortfolioServiceOption[];
  masterTags: PortfolioTagOption[];
};

/**
 * Single portfolio tile — image + hidden badge + reorder controls +
 * inline menu. Click anywhere on the tile (outside the controls) opens
 * the edit modal.
 *
 * The menu is a tiny popover that toggles via local state. We don't
 * pull in radix-popover for one button — `useState` + outside-click
 * via a backdrop is sufficient.
 */
export function PortfolioCard({
  item,
  isFirst,
  isLast,
  categories,
  services,
  masterTags,
}: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const togglePublic = async () => {
    if (busy) return;
    setBusy(true);
    setMenuOpen(false);
    try {
      const response = await fetch(`/api/master/portfolio/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !item.isPublic }),
      });
      if (!response.ok) {
        window.alert(UI_TEXT.cabinetMaster.portfolioPage.edit.errorUpdate);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    setMenuOpen(false);
    if (!window.confirm(UI_TEXT.cabinetMaster.portfolioPage.edit.confirmDelete)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/master/portfolio/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        window.alert(UI_TEXT.cabinetMaster.portfolioPage.edit.errorDelete);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "group relative aspect-square overflow-hidden rounded-xl border border-border-subtle bg-bg-input transition-shadow",
          "hover:shadow-card",
          !item.isPublic && "opacity-95"
        )}
      >
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          aria-label={T.editAriaLabel}
          className="block h-full w-full"
        >
          <img
            src={item.mediaUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </button>

        {!item.isPublic ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-bg-card/90 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec shadow-card">
            <EyeOff className="h-3 w-3" aria-hidden />
            {T.hiddenBadge}
          </span>
        ) : null}

        <ReorderControls itemId={item.id} isFirst={isFirst} isLast={isLast} />

        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            aria-label={T.menuAria}
            disabled={busy}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-bg-card/95 text-text-main shadow-card transition-colors hover:bg-bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <MoreVertical className="h-3.5 w-3.5" aria-hidden />
          </button>
          {menuOpen ? (
            <>
              <button
                type="button"
                aria-label="close-menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <ul
                className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-border-subtle bg-bg-card py-1 shadow-card"
              >
                <MenuItem
                  icon={Pencil}
                  label={M.edit}
                  onClick={() => {
                    setMenuOpen(false);
                    setEditOpen(true);
                  }}
                />
                <MenuItem
                  icon={item.isPublic ? EyeOff : Eye}
                  label={item.isPublic ? M.hide : M.show}
                  onClick={togglePublic}
                />
                <li className="my-0.5 border-t border-border-subtle" />
                <MenuItem
                  icon={Trash2}
                  label={M.delete}
                  onClick={handleDelete}
                  destructive
                />
              </ul>
            </>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center bg-gradient-to-t from-black/40 via-black/0 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="secondary"
            size="sm"
            className="pointer-events-auto gap-1.5"
            onClick={(event) => {
              event.stopPropagation();
              setEditOpen(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            {M.edit}
          </Button>
        </div>
      </div>

      {editOpen ? (
        <EditItemModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          item={item}
          categories={categories}
          services={services}
          masterTags={masterTags}
        />
      ) : null}
    </>
  );
}

function MenuItem({
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
