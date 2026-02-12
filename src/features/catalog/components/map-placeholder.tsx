"use client";

import { UI_TEXT } from "@/lib/ui/text";

type MapPoint = {
  id: string;
  title: string;
  type: "master" | "studio";
};

type MapPlaceholderProps = {
  points: MapPoint[];
};

export function MapPlaceholder({ points }: MapPlaceholderProps) {
  return (
    <section className="rounded-2xl border border-border bg-card/70 p-4">
      <div className="rounded-xl border border-border bg-background/80 p-4">
        <div className="text-sm font-semibold text-foreground">{UI_TEXT.catalog.mapPlaceholderTitle}</div>
        <div className="mt-1 text-xs text-muted-foreground">{UI_TEXT.catalog.mapPlaceholderDesc}</div>
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {UI_TEXT.catalog.mapPointsTitle}
        </div>
        <div className="mt-2 space-y-2">
          {points.slice(0, 12).map((point) => (
            <div key={point.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
              <span className="truncate text-sm text-foreground">{point.title}</span>
              <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                {point.type}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

