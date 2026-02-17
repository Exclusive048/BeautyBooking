"use client";

import Link from "next/link";
import { moneyRUB } from "@/lib/format";
import { UI_TEXT } from "@/lib/ui/text";

type MapSidebarItem = {
  id: string;
  title: string;
  type: "master" | "studio";
  avatarUrl: string | null;
  ratingAvg: number;
  priceFrom: number | null;
  href: string | null;
};

type CatalogMapSidebarProps = {
  items: MapSidebarItem[];
  open: boolean;
  onClose: () => void;
  onHover: (id: string | null) => void;
};


function formatRating(ratingAvg: number): string {
  if (Number.isFinite(ratingAvg) && ratingAvg > 0) {
    return `${ratingAvg.toFixed(1)}`;
  }
  return UI_TEXT.catalog.newLabel;
}

export function CatalogMapSidebar({ items, open, onClose, onHover }: CatalogMapSidebarProps) {
  const panelBase =
    "z-20 flex flex-col rounded-2xl border border-border bg-background/95 shadow-card backdrop-blur transition-all duration-300";

  return (
    <>
      <aside
        className={`absolute right-4 top-4 bottom-4 hidden w-[360px] lg:flex ${panelBase} ${open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-6 opacity-0"}`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">Найдено в этой точке: {items.length}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-3 py-1 text-xs text-foreground"
          >
            {UI_TEXT.common.close}
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {items.map((item) => {
            const content = (
              <div
                className="flex items-center gap-3 rounded-xl border border-border bg-card/80 px-3 py-2 text-sm transition hover:border-border-subtle"
                onMouseEnter={() => onHover(item.id)}
                onMouseLeave={() => onHover(null)}
              >
                {item.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.avatarUrl}
                    alt={item.title}
                    className={`h-10 w-10 object-cover ring-1 ring-border-subtle ${item.type === "master" ? "rounded-full" : "rounded-xl"}`}
                  />
                ) : (
                  <div className={`h-10 w-10 bg-muted ${item.type === "master" ? "rounded-full" : "rounded-xl"}`} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{formatRating(item.ratingAvg)}</div>
                </div>
                <div className="text-right text-xs text-foreground">
                  <div>{item.priceFrom && item.priceFrom > 0 ? `${UI_TEXT.catalog.priceFrom} ${moneyRUB(item.priceFrom)}` : UI_TEXT.catalog.priceOnRequest}</div>
                  <div className="text-muted-foreground">→</div>
                </div>
              </div>
            );

            if (!item.href) return <div key={item.id}>{content}</div>;

            return (
              <Link key={item.id} href={item.href} className="block">
                {content}
              </Link>
            );
          })}
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/60 px-3 py-4 text-center text-xs text-muted-foreground">
              Выберите кластер, чтобы увидеть список мастеров.
            </div>
          ) : null}
        </div>
      </aside>

      <div
        className={`absolute left-0 right-0 bottom-0 lg:hidden ${panelBase} ${open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"}`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold text-foreground">Найдено в этой точке: {items.length}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-3 py-1 text-xs text-foreground"
          >
            {UI_TEXT.common.close}
          </button>
        </div>
        <div className="max-h-[45vh] space-y-2 overflow-y-auto p-4">
          {items.map((item) => {
            const content = (
              <div
                className="flex items-center gap-3 rounded-xl border border-border bg-card/80 px-3 py-2 text-sm"
                onMouseEnter={() => onHover(item.id)}
                onMouseLeave={() => onHover(null)}
              >
                {item.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.avatarUrl}
                    alt={item.title}
                    className={`h-10 w-10 object-cover ring-1 ring-border-subtle ${item.type === "master" ? "rounded-full" : "rounded-xl"}`}
                  />
                ) : (
                  <div className={`h-10 w-10 bg-muted ${item.type === "master" ? "rounded-full" : "rounded-xl"}`} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{formatRating(item.ratingAvg)}</div>
                </div>
                <div className="text-right text-xs text-foreground">
                  <div>{item.priceFrom && item.priceFrom > 0 ? `${UI_TEXT.catalog.priceFrom} ${moneyRUB(item.priceFrom)}` : UI_TEXT.catalog.priceOnRequest}</div>
                  <div className="text-muted-foreground">→</div>
                </div>
              </div>
            );

            if (!item.href) return <div key={item.id}>{content}</div>;

            return (
              <Link key={item.id} href={item.href} className="block">
                {content}
              </Link>
            );
          })}
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/60 px-3 py-4 text-center text-xs text-muted-foreground">
              Выберите кластер, чтобы увидеть список мастеров.
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
