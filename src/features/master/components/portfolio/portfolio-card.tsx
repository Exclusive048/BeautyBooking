"use client";

import { ArrowLeft, ArrowRight, Eye, EyeOff, MoreVertical, Pencil, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { PhotoActionButton } from "@/components/ui/photo-action-button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { useConfirm } from "@/hooks/use-confirm";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { cn } from "@/lib/cn";
import type {
  PortfolioCategoryOption,
  PortfolioItemView,
  PortfolioServiceOption,
  PortfolioTagOption,
} from "@/lib/master/portfolio-view.service";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { EditItemModal } from "./modals/edit-item-modal";

const T = UI_TEXT.cabinetMaster.portfolioPage.card;
const M = UI_TEXT.cabinetMaster.portfolioPage.menu;
const R = UI_TEXT.cabinetMaster.portfolioPage.reorder;

/** Ширина меню «⋮» и отступ от края экрана. */
const MENU_WIDTH_PX = 224;
const MENU_EDGE_PX = 8;
/** Высота пункта меню (`min-h-11`) и вертикальные поля списка. */
const MENU_ITEM_PX = 44;
const MENU_PADDING_PX = 8;
/** Прокрутка страницы, после которой меню у кнопки закрывается. */
const MENU_SCROLL_CLOSE_PX = 24;

type MenuPosition = { top: number; left: number };

/**
 * Меню открывается у кнопки, но в границах экрана: шире плитки на телефоне,
 * поэтому у левой колонки оно не должно уезжать за край, а у нижнего ряда —
 * под нижнюю навигацию (тогда открывается вверх).
 */
function placeMenu(anchor: DOMRect, itemCount: number): MenuPosition {
  const height = itemCount * MENU_ITEM_PX + MENU_PADDING_PX;
  const left = Math.min(
    Math.max(MENU_EDGE_PX, anchor.right - MENU_WIDTH_PX),
    window.innerWidth - MENU_WIDTH_PX - MENU_EDGE_PX,
  );
  // Нижняя навигация телефона закрывает низ экрана (`--bottom-nav-h` ставит
  // `BottomTabBar`; на ПК — 0).
  const bottomNav =
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bottom-nav-h")) || 0;
  const below = anchor.bottom + 4;
  const fitsBelow = below + height <= window.innerHeight - bottomNav - MENU_EDGE_PX;
  return { left, top: fitsBelow ? below : Math.max(MENU_EDGE_PX, anchor.top - height - 4) };
}

type Props = {
  item: PortfolioItemView;
  isFirst: boolean;
  isLast: boolean;
  categories: PortfolioCategoryOption[];
  services: PortfolioServiceOption[];
  masterTags: PortfolioTagOption[];
};

/**
 * Плитка работы: фото, значки «Главное фото» / «скрыта» и кнопки поверх фото.
 *
 * «Изменить» и «Удалить» видны всегда (снизу справа), остальное — в меню «⋮»
 * (сверху справа): сделать главным, скрыть/показать, переместить раньше/позже.
 * Раньше кнопки появлялись только при наведении, а стрелки порядка на телефоне
 * не появлялись вовсе — действия с работой было не найти. Нажатие на само фото
 * по-прежнему открывает редактирование.
 *
 * Меню — портал с фиксированной позицией у кнопки и прозрачный
 * слой-«закрыватель»: внутри плитки (`overflow-hidden`) оно обрезалось.
 * Закрывается по Esc, прокрутке и нажатию мимо.
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
  const toast = useToast();
  const { confirm, modal: confirmModal } = useConfirm();
  const [editOpen, setEditOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  // Портал — только после гидрации (MODAL-SSR-OPEN-HYDRATION).
  const isHydrated = useIsHydrated();
  const menuOpen = menuPos !== null;
  const closeMenu = () => setMenuPos(null);
  const [busy, setBusy] = useState(false);
  const number = String(item.globalIndex + 1);
  const canMakeCover = item.isPublic && !item.isCatalogCover;
  const menuItemCount = 1 + (canMakeCover ? 1 : 0) + (isFirst ? 0 : 1) + (isLast ? 0 : 1);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuPos(null);
    // Меню стоит у кнопки фиксированно — заметная прокрутка страницы его
    // закрывает. Мелкая (докатывающаяся плавная прокрутка) — нет.
    const openedAt = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - openedAt) > MENU_SCROLL_CLOSE_PX) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const runAction = async (action: () => Promise<unknown>, errorMessage: string) => {
    if (busy) return;
    setBusy(true);
    closeMenu();
    try {
      await action();
      router.refresh();
    } catch (error) {
      toast.error(serverMessageOr(error, errorMessage));
    } finally {
      setBusy(false);
    }
  };

  const togglePublic = () =>
    runAction(
      () =>
        fetchJsonWithAuth(`/api/master/portfolio/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublic: !item.isPublic }),
        }),
      UI_TEXT.cabinetMaster.portfolioPage.edit.errorUpdate,
    );

  // CATALOG-MAIN-PHOTO: главное фото = первая публичная работа, поэтому
  // «Сделать главным» — это перенос в начало портфолио.
  const move = (direction: "top" | "up" | "down") =>
    runAction(
      () =>
        fetchJsonWithAuth("/api/master/portfolio/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id, direction }),
        }),
      direction === "top" ? M.makeCoverError : R.errorMessage,
    );

  const handleDelete = async () => {
    if (busy) return;
    closeMenu();
    const ok = await confirm({
      message: UI_TEXT.cabinetMaster.portfolioPage.edit.confirmDelete,
      variant: "danger",
    });
    if (!ok) return;
    await runAction(
      () => fetchJsonWithAuth(`/api/master/portfolio/${item.id}`, { method: "DELETE" }),
      UI_TEXT.cabinetMaster.portfolioPage.edit.errorDelete,
    );
  };

  return (
    <>
      <div
        className={cn(
          "group relative aspect-square overflow-hidden rounded-xl border border-border-subtle bg-bg-input transition-shadow",
          "hover:shadow-card",
          !item.isPublic && "opacity-95"
        )}
        data-testid="portfolio-card"
      >
        {/* Нажатие на фото — то же, что «Изменить»; с клавиатуры до правки ведёт
            кнопка-карандаш, поэтому здесь фокуса нет. */}
        <Button
          type="button"
          variant="wrapper"
          size="none"
          tabIndex={-1}
          aria-hidden
          onClick={() => setEditOpen(true)}
          className="relative block h-full w-full"
        >
          <ResilientImage
            src={item.mediaUrl}
            alt={T.imageAltTemplate.replace("{n}", number)}
            loading="lazy"
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
          />
        </Button>

        {item.isCatalogCover ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-gradient px-2 py-0.5 text-[10px] font-semibold text-white shadow-card">
            <Star className="h-3 w-3 fill-current" aria-hidden />
            {T.coverBadge}
          </span>
        ) : null}

        {!item.isPublic ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-bg-card/90 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec shadow-card">
            <EyeOff className="h-3 w-3" aria-hidden />
            {T.hiddenBadge}
          </span>
        ) : null}

        <div className="absolute right-0 top-0">
          <PhotoActionButton
            label={T.menuAria}
            expanded={menuOpen}
            onClick={(event) => {
              // Координаты — сразу: к вызову функции-обновителя React уже
              // обнулит `currentTarget`.
              const anchor = event.currentTarget.getBoundingClientRect();
              setMenuPos((prev) => (prev ? null : placeMenu(anchor, menuItemCount)));
            }}
            disabled={busy}
            data-testid="portfolio-card-menu"
          >
            <MoreVertical className="h-4 w-4" aria-hidden />
          </PhotoActionButton>
        </div>
        {isHydrated && menuPos
          ? createPortal(
            <>
              <Button
                type="button"
                variant="wrapper"
                size="none"
                aria-label={UI_TEXT.a11y.closeMenu}
                className="fixed inset-0 z-popover cursor-default"
                onClick={() => closeMenu()}
              />
              <ul
                className="fixed z-popover rounded-xl border border-border-subtle bg-bg-card py-1 shadow-hover"
                style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH_PX }}
                data-testid="portfolio-card-menu-list"
              >
                {canMakeCover ? (
                  <MenuItem icon={Star} label={M.makeCover} onClick={() => void move("top")} />
                ) : null}
                <MenuItem
                  icon={item.isPublic ? EyeOff : Eye}
                  label={item.isPublic ? M.hide : M.show}
                  onClick={() => void togglePublic()}
                />
                {!isFirst ? (
                  <MenuItem icon={ArrowLeft} label={M.moveEarlier} onClick={() => void move("up")} />
                ) : null}
                {!isLast ? (
                  <MenuItem icon={ArrowRight} label={M.moveLater} onClick={() => void move("down")} />
                ) : null}
              </ul>
            </>,
            document.body,
          )
          : null}

        <div className="absolute bottom-0 right-0 flex">
          <PhotoActionButton
            label={T.editAriaTemplate.replace("{n}", number)}
            onClick={() => setEditOpen(true)}
            disabled={busy}
            data-testid="portfolio-card-edit"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </PhotoActionButton>
          <PhotoActionButton
            label={T.deleteAriaTemplate.replace("{n}", number)}
            onClick={() => void handleDelete()}
            disabled={busy}
            data-testid="portfolio-card-delete"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </PhotoActionButton>
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
      {confirmModal}
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
}) {
  return (
    <li>
      <Button
        type="button"
        variant="wrapper"
        size="none"
        onClick={onClick}
        className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-main transition-colors hover:bg-bg-input"
      >
        <Icon className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
        {label}
      </Button>
    </li>
  );
}
