"use client";

import { Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminCitiesCounts } from "@/features/admin-cabinet/cities/types";

type Props = {
  counts: AdminCitiesCounts;
  onAdd: () => void;
  onFindDuplicates: () => void;
};

const T = UI_TEXT.adminPanel.cities;

/** Caption strip "Города · N всего · K дублей" + primary CTA + the
 * conditional «Найти дубли» button which only shows when at least one
 * duplicate group was detected. */
export function CitiesHeader({ counts, onAdd, onFindDuplicates }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-text-sec">
        <span>{T.header.captionRoot}</span>
        <span className="mx-1.5 text-text-sec/40" aria-hidden>
          ·
        </span>
        <span>
          <span className="tabular-nums text-text-main">{counts.all}</span>{" "}
          {T.header.countsTotal}
        </span>
        {counts.dup > 0 ? (
          <>
            <span className="mx-1.5 text-text-sec/40" aria-hidden>
              ·
            </span>
            <span>
              <span className="tabular-nums text-amber-600 dark:text-amber-400">
                {counts.dup}
              </span>{" "}
              {T.header.countsDups}
            </span>
          </>
        ) : null}
      </p>

      <div className="flex items-center gap-2">
        {counts.dup > 0 ? (
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onFindDuplicates}
          >
            <Layers className="mr-1.5 h-4 w-4" aria-hidden />
            {T.findDuplicates} ({counts.dup})
          </Button>
        ) : null}
        <Button type="button" variant="primary" size="md" onClick={onAdd}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {T.addCity}
        </Button>
      </div>
    </div>
  );
}
