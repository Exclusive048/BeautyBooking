"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CityTagBadge } from "@/features/admin-cabinet/cities/components/city-tag-badge";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminCityRow } from "@/features/admin-cabinet/cities/types";

const T = UI_TEXT.adminPanel.cities.detail;

export type CityEditDraft = {
  name: string;
  nameGenitive: string;
  latitude: string;
  longitude: string;
  timezone: string;
  sortOrder: string;
  isActive: boolean;
  autoCreated: boolean;
};

type Props = {
  city: AdminCityRow;
  onClose?: () => void;
  onSave: (patch: {
    name: string;
    nameGenitive: string | null;
    latitude: number;
    longitude: number;
    timezone: string;
    sortOrder: number;
    isActive: boolean;
    autoCreated: boolean;
  }) => Promise<void>;
  onDelete: () => void;
};

const TIMEZONE_OPTIONS = [
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Europe/Samara",
  "Europe/Volgograd",
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Yakutsk",
  "Asia/Vladivostok",
  "Asia/Magadan",
  "Asia/Kamchatka",
  "Asia/Almaty",
];

function toDraft(city: AdminCityRow): CityEditDraft {
  return {
    name: city.name,
    nameGenitive: city.nameGenitive ?? "",
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    timezone: city.timezone,
    sortOrder: String(city.sortOrder),
    isActive: city.isActive,
    autoCreated: city.autoCreated,
  };
}

/** Inline form rendered inside the detail panel. Local state with an
 * explicit Save button — admin actions on shared infrastructure rows
 * should never be auto-saved silently. */
export function CityEditForm({ city, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<CityEditDraft>(toDraft(city));
  const [saving, setSaving] = useState(false);

  // Re-initialise the draft whenever a different city is selected
  // (URL `?selected=` change). `city.id` is the stable identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(toDraft(city)), [city.id]);

  const submit = async () => {
    const lat = Number(draft.latitude);
    const lng = Number(draft.longitude);
    const sort = Number(draft.sortOrder);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: draft.name.trim(),
        nameGenitive: draft.nameGenitive.trim() || null,
        latitude: lat,
        longitude: lng,
        timezone: draft.timezone.trim() || "Europe/Moscow",
        sortOrder: Number.isFinite(sort) ? sort : 100,
        isActive: draft.isActive,
        autoCreated: draft.autoCreated,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <CityTagBadge tag={city.tag} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-sec">
            {T.caption}
          </p>
          <h2 className="truncate font-display text-lg text-text-main">
            {city.name}
          </h2>
        </div>
      </div>

      <Field label={T.fields.name}>
        <Input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </Field>

      <Field label={T.fields.nameGenitive} hint={T.fields.nameGenitiveHint}>
        <Input
          value={draft.nameGenitive}
          onChange={(e) => setDraft({ ...draft, nameGenitive: e.target.value })}
          placeholder="—"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={T.fields.latitude}>
          <Input
            inputMode="decimal"
            value={draft.latitude}
            onChange={(e) => setDraft({ ...draft, latitude: e.target.value })}
          />
        </Field>
        <Field label={T.fields.longitude}>
          <Input
            inputMode="decimal"
            value={draft.longitude}
            onChange={(e) => setDraft({ ...draft, longitude: e.target.value })}
          />
        </Field>
      </div>

      <Field label={T.fields.timezone}>
        <Select
          value={draft.timezone}
          onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={T.fields.sortOrder} hint={T.fields.sortOrderHint}>
        <Input
          inputMode="numeric"
          value={draft.sortOrder}
          onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
        />
      </Field>

      <div className="flex items-center justify-between rounded-xl border border-border-subtle/60 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-text-main">
            {T.fields.isActive}
          </p>
          <p className="mt-0.5 text-xs text-text-sec">{T.fields.isActiveHint}</p>
        </div>
        <Switch
          checked={draft.isActive}
          onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
        />
      </div>

      {/* Switch UI is inverted from the schema flag: Switch ON =
          "Проверен админом" = autoCreated:false. Admins think in
          terms of "verified" (a positive action); the schema
          stores the negative (auto-created flag) for backwards-
          compat with the detect-city flow. Inversion only at the
          UI layer — the PATCH body carries the raw boolean. */}
      <div className="flex items-center justify-between rounded-xl border border-border-subtle/60 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-text-main">
            {T.fields.autoCreated}
          </p>
          <p className="mt-0.5 text-xs text-text-sec">
            {T.fields.autoCreatedHint}
          </p>
        </div>
        <Switch
          checked={!draft.autoCreated}
          onCheckedChange={(checked) =>
            setDraft({ ...draft, autoCreated: !checked })
          }
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button variant="ghost" onClick={onDelete} disabled={saving}>
          {T.actions.delete}
        </Button>
        <div className="flex items-center gap-2">
          {onClose ? (
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              {T.actions.close}
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {T.actions.save}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-sec">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-text-sec/70">{hint}</span> : null}
    </label>
  );
}
