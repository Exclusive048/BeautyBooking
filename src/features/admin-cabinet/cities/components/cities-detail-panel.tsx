"use client";

import { MapPin } from "lucide-react";
import { CityDuplicateBanner } from "@/features/admin-cabinet/cities/components/city-duplicate-banner";
import { CityEditForm } from "@/features/admin-cabinet/cities/components/city-edit-form";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminCityRow,
  AdminDuplicateGroup,
} from "@/features/admin-cabinet/cities/types";

const T = UI_TEXT.adminPanel.cities.detail;

type Props = {
  city: AdminCityRow | null;
  duplicateGroups: AdminDuplicateGroup[];
  onSave: (
    city: AdminCityRow,
    patch: {
      name: string;
      nameGenitive: string | null;
      latitude: number;
      longitude: number;
      timezone: string;
      sortOrder: number;
      isActive: boolean;
      autoCreated: boolean;
    },
  ) => Promise<void>;
  onDelete: (city: AdminCityRow) => void;
  onMerge: (city: AdminCityRow, targetId: string) => void;
  /** Used on mobile to dismiss the panel-as-sheet. Desktop ignores. */
  onClose?: () => void;
};

/**
 * Right-side detail panel. Empty state when no city selected; edit form
 * + optional duplicate banner when one is. Banner only renders when the
 * selected city is a duplicate **and** isn't the canonical member of
 * its group — admins shouldn't be nudged to merge the "winning" city
 * away. The merge dialog is opened by the parent via `onMerge` callback
 * with `targetId = canonical.id`.
 */
export function CitiesDetailPanel({
  city,
  duplicateGroups,
  onSave,
  onDelete,
  onMerge,
  onClose,
}: Props) {
  if (!city) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle bg-bg-card/40 px-6 py-12 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-input">
          <MapPin className="h-6 w-6 text-text-sec" aria-hidden />
        </div>
        <p className="mb-1 font-display text-base text-text-main">
          {T.empty.title}
        </p>
        <p className="max-w-xs text-sm text-text-sec">{T.empty.hint}</p>
      </div>
    );
  }

  const group =
    city.duplicateGroupId
      ? duplicateGroups.find((g) => g.groupId === city.duplicateGroupId) ?? null
      : null;
  const canonical = group?.cities.find((c) => c.isCanonical) ?? null;
  // Only show the "merge into canonical" banner on non-canonical rows.
  const showBanner =
    !!group && !!canonical && canonical.id !== city.id;

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card">
      {showBanner && canonical ? (
        <div className="mb-4">
          <CityDuplicateBanner
            canonicalName={canonical.name}
            onMerge={() => onMerge(city, canonical.id)}
          />
        </div>
      ) : null}
      <CityEditForm
        city={city}
        onClose={onClose}
        onSave={(patch) => onSave(city, patch)}
        onDelete={() => onDelete(city)}
      />
    </div>
  );
}
