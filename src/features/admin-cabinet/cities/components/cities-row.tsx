"use client";

import { Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { CityTagBadge } from "@/features/admin-cabinet/cities/components/city-tag-badge";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminCityRow } from "@/features/admin-cabinet/cities/types";

type Props = {
  city: AdminCityRow;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
};

const T = UI_TEXT.adminPanel.cities;

/**
 * One row in the desktop table. Click selects the row (drives the side
 * detail panel via URL state). The visibility switch is rendered inline
 * so admins can hide/show without opening the detail panel.
 */
export function CitiesRow({
  city,
  selected,
  busy,
  onSelect,
  onToggleVisible,
}: Props) {
  const isDuplicate = city.duplicateGroupId !== null;
  return (
    <tr
      onClick={onSelect}
      className={cn(
        "cursor-pointer transition-colors",
        selected
          ? "bg-bg-input/60"
          : "hover:bg-bg-input/30",
      )}
    >
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-3">
          <CityTagBadge tag={city.tag} isDuplicate={isDuplicate} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-text-main">
              <span className="truncate">{city.name}</span>
              {city.autoCreated ? (
                <Sparkles
                  className="h-3 w-3 shrink-0 text-text-sec/60"
                  aria-label={T.autoCreated.tooltip}
                />
              ) : null}
            </p>
            {isDuplicate ? (
              <p className="mt-0.5 font-mono text-[11px] text-amber-600 dark:text-amber-400">
                {T.duplicateMarker.label}
              </p>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right align-top text-sm tabular-nums text-text-main">
        {city.mastersCount}
      </td>
      <td className="px-4 py-3 text-right align-top text-sm tabular-nums text-text-sec">
        {city.studiosCount}
      </td>
      <td className="px-4 py-3 align-top">
        <div
          className="flex justify-center"
          onClick={(event) => event.stopPropagation()}
        >
          <Switch
            checked={city.isActive}
            disabled={busy}
            onCheckedChange={onToggleVisible}
            aria-label={T.rowActions.toggleVisible}
          />
        </div>
      </td>
    </tr>
  );
}
