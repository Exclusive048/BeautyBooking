"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  current: number;
  total: number;
  onChange: (page: number) => void;
};

const T = UI_TEXT.catalog2.pagination;

/**
 * Numbered pagination matching the reference: brand-gradient background on
 * the active page, Geist Mono numerals for tabular alignment. When `total > 5`
 * we ellipsize the middle so the bar stays compact: e.g. `‹ 1 2 3 … 12 ›`.
 */
function buildPages(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  // Always show first, last, current, plus neighbours.
  const result: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) result.push("ellipsis");
  for (let i = start; i <= end; i += 1) result.push(i);
  if (end < total - 1) result.push("ellipsis");
  result.push(total);
  return result;
}

export function CatalogPagination({ current, total, onChange }: Props) {
  if (total <= 1) return null;
  const pages = buildPages(current, total);

  const cellBase =
    "inline-flex h-9 w-9 items-center justify-center rounded-xl font-mono text-sm font-medium tabular-nums transition-colors";
  const inactive = "border border-border-subtle bg-bg-card text-text-main hover:bg-bg-input";
  const active = "bg-brand-gradient text-white border border-transparent";

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Пагинация">
      <button
        type="button"
        aria-label={T.prevAria}
        disabled={current === 1}
        onClick={() => onChange(current - 1)}
        className={`${cellBase} ${inactive} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>

      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className={`${cellBase} cursor-default border-transparent bg-transparent text-text-sec`}
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === current ? "page" : undefined}
            className={`${cellBase} ${p === current ? active : inactive}`}
          >
            {p}
          </button>
        ),
      )}

      <button
        type="button"
        aria-label={T.nextAria}
        disabled={current === total}
        onClick={() => onChange(current + 1)}
        className={`${cellBase} ${inactive} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}
