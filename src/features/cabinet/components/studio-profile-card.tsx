"use client";

import { useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { PortfolioEditor } from "@/features/media/components/portfolio-editor";

type Props = {
  studioId: string;
  canEdit?: boolean;
  provider: {
    name: string;
    avatarUrl?: string | null;
    tagline: string;
    address: string;
    district: string;
    categories: string[];
  };
};

type ProfileForm = {
  name: string;
  tagline: string;
  address: string;
  district: string;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function StudioProfileCard({ provider, studioId, canEdit = true }: Props) {
  const inputClass =
    "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

  const [initial, setInitial] = useState<ProfileForm>({
    name: provider.name,
    tagline: provider.tagline,
    address: provider.address,
    district: provider.district,
  });

  const [form, setForm] = useState<ProfileForm>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    const norm = (value: string) => value.trim();
    return (
      norm(form.name) !== norm(initial.name) ||
      norm(form.tagline) !== norm(initial.tagline) ||
      norm(form.address) !== norm(initial.address) ||
      norm(form.district) !== norm(initial.district)
    );
  }, [form, initial]);

  const onSave = async () => {
    if (!dirty || !canEdit || saving) return;
    setSaving(true);
    setSaved(null);
    setError(null);

    try {
      const res = await fetch(`/api/studios/${studioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          tagline: form.tagline,
          address: form.address,
          district: form.district,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ studio: ProfileForm }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Не удалось сохранить"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Не удалось сохранить"));

      setInitial(form);
      setSaved("Сохранено");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border p-5 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Профиль студии</h3>
        <p className="mt-1 text-sm text-neutral-600">Информация о студии и контакты.</p>
      </div>

      <AvatarEditor
        entityType="STUDIO"
        entityId={studioId}
        canEdit={canEdit}
        fallbackUrl={provider.avatarUrl ?? null}
      />
      <PortfolioEditor entityType="STUDIO" entityId={studioId} canEdit={canEdit} />

      {saved ? (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
          {saved}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600">Название</div>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600">Район</div>
          <input
            className={inputClass}
            value={form.district}
            onChange={(e) => setForm((s) => ({ ...s, district: e.target.value }))}
            disabled={!canEdit}
          />
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-neutral-600">Описание</div>
        <input
          className={inputClass}
          value={form.tagline}
          onChange={(e) => setForm((s) => ({ ...s, tagline: e.target.value }))}
          disabled={!canEdit}
        />
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-neutral-600">Адрес</div>
        <input
          className={inputClass}
          value={form.address}
          onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
          disabled={!canEdit}
        />
      </div>

      {provider.categories.length ? (
        <div className="space-y-1">
          <div className="text-xs font-medium text-neutral-600">Категории</div>
          <div className="flex flex-wrap gap-2 text-xs text-neutral-700">
            {provider.categories.map((c) => (
              <span key={c} className="rounded-full border px-3 py-1">
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          disabled={!canEdit || !dirty || saving}
          onClick={onSave}
          className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
