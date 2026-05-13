"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { citySlugFromName } from "@/lib/cities/normalize";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.adminPanel.cities.createDialog;

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

export type CreateCityValue = {
  name: string;
  slug?: string;
  nameGenitive: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  sortOrder: number;
  isActive: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: CreateCityValue) => Promise<void>;
};

const DEFAULTS = {
  name: "",
  slug: "",
  nameGenitive: "",
  latitude: "55.7558",
  longitude: "37.6173",
  timezone: "Europe/Moscow",
  sortOrder: "100",
  isActive: true,
};

export function CreateCityDialog({ open, onClose, onSubmit }: Props) {
  const [draft, setDraft] = useState({ ...DEFAULTS });
  const [slugManual, setSlugManual] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft({ ...DEFAULTS });
    setSlugManual(false);
    setError(null);
  }, [open]);

  // Auto-derive slug from name unless the admin chose to edit manually.
  useEffect(() => {
    if (slugManual) return;
    setDraft((prev) => ({ ...prev, slug: citySlugFromName(prev.name) }));
  }, [draft.name, slugManual]);

  const submit = async () => {
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setError(T.errorName);
      return;
    }
    const lat = Number(draft.latitude);
    const lng = Number(draft.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError(T.errorCoords);
      return;
    }
    const sort = Number(draft.sortOrder);
    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        slug: slugManual && draft.slug.trim() ? draft.slug.trim() : undefined,
        nameGenitive: draft.nameGenitive.trim() || null,
        latitude: lat,
        longitude: lng,
        timezone: draft.timezone.trim() || "Europe/Moscow",
        sortOrder: Number.isFinite(sort) ? sort : 100,
        isActive: draft.isActive,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={onClose} title={T.title}>
      <div className="space-y-4">
        <Field label={T.nameLabel}>
          <Input
            value={draft.name}
            placeholder={T.namePlaceholder}
            autoFocus
            onChange={(e) => {
              setDraft({ ...draft, name: e.target.value });
              if (error) setError(null);
            }}
          />
        </Field>

        <Field
          label={T.slugLabel}
          hint={
            slugManual ? undefined : T.slugHint
          }
        >
          <div className="flex items-center gap-2">
            <Input
              value={draft.slug}
              disabled={!slugManual}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
            />
            {!slugManual ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSlugManual(true)}
              >
                {T.slugEditMode}
              </Button>
            ) : null}
          </div>
        </Field>

        <Field label={T.nameGenitiveLabel}>
          <Input
            value={draft.nameGenitive}
            onChange={(e) => setDraft({ ...draft, nameGenitive: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={T.latitudeLabel}>
            <Input
              inputMode="decimal"
              value={draft.latitude}
              onChange={(e) => setDraft({ ...draft, latitude: e.target.value })}
            />
          </Field>
          <Field label={T.longitudeLabel}>
            <Input
              inputMode="decimal"
              value={draft.longitude}
              onChange={(e) => setDraft({ ...draft, longitude: e.target.value })}
            />
          </Field>
        </div>

        <Field label={T.timezoneLabel}>
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

        <Field label={T.sortOrderLabel}>
          <Input
            inputMode="numeric"
            value={draft.sortOrder}
            onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
          />
        </Field>

        <div className="flex items-center justify-between rounded-xl border border-border-subtle/60 px-3 py-2.5">
          <span className="text-sm text-text-main">{T.isActiveLabel}</span>
          <Switch
            checked={draft.isActive}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, isActive: checked })
            }
          />
        </div>

        {error ? (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={submitting}>
            {T.save}
          </Button>
        </div>
      </div>
    </ModalSurface>
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
