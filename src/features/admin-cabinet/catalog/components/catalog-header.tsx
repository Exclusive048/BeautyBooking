"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminCategoryCounts } from "@/features/admin-cabinet/catalog/types";

type Props = {
  counts: AdminCategoryCounts;
  onAdd: () => void;
};

const T = UI_TEXT.adminPanel.catalog;

/**
 * Page-level caption strip above the filter bar. Renders the
 * "Каталог · N категорий · M на модерации" subline next to a primary
 * CTA on the right. Client component because the CTA wires into the
 * dialog state that lives in the table wrapper above it — server-only
 * would need an extra round-trip just to open a modal.
 */
export function CatalogHeader({ counts, onAdd }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-sec">
        <span>{T.header.captionRoot}</span>
        <span className="mx-1.5 text-text-sec/40" aria-hidden>
          ·
        </span>
        <span>
          <span className="tabular-nums text-text-main">{counts.all}</span>{" "}
          {T.header.captionTotal}
        </span>
        {counts.pending > 0 ? (
          <>
            <span className="mx-1.5 text-text-sec/40" aria-hidden>
              ·
            </span>
            <span>
              <span className="tabular-nums text-amber-600 dark:text-amber-400">
                {counts.pending}
              </span>{" "}
              {T.header.captionPending}
            </span>
          </>
        ) : null}
      </p>

      <Button type="button" variant="primary" size="md" onClick={onAdd}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden />
        {T.addButton}
      </Button>
    </div>
  );
}
