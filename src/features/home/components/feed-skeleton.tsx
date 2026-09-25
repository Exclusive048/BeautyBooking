"use client";

import { cn } from "@/lib/cn";
import {
  COLLAGE_COLUMN_CLASS,
  COLLAGE_RATIO_CLASS,
  COLLAGE_ROW_CLASS,
  collageRatioFor,
  placeInColumns,
} from "@/features/home/lib/collage-layout";

type Props = {
  count: number;
  columns: number;
};

/** Скелетон коллажа: те же колонки и тот же рисунок высот, что у ленты. */
export function FeedCollageSkeleton({ count, columns }: Props) {
  const keys = Array.from({ length: count }, (_, i) => `skeleton-${i}`);
  const placed = placeInColumns(keys, columns, collageRatioFor);
  return (
    <div className={COLLAGE_ROW_CLASS} aria-hidden>
      {placed.map((column, columnIndex) => (
        <div key={columnIndex} className={COLLAGE_COLUMN_CLASS}>
          {column.map(({ item }) => (
            <div
              key={item}
              className={cn(
                "w-full animate-pulse rounded-2xl bg-bg-input/60",
                COLLAGE_RATIO_CLASS[collageRatioFor(item)],
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
