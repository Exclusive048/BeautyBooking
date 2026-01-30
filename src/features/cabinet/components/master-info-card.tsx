"use client";

import { useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type StudioInfo = {
  id: string;
  name: string;
  roleLabel?: string | null;
  canLeave?: boolean;
};

type Props = {
  address: string;
  studio: StudioInfo | null;
  canEditProfile?: boolean;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function MasterInfoCard({ address, studio, canEditProfile = true }: Props) {
  const inputClass =
    "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200";

  const [initial, setInitial] = useState(address);
  const [value, setValue] = useState(address);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(() => value.trim() !== initial.trim(), [value, initial]);
  const canEdit = Boolean(studio?.id) && canEditProfile;

  const onSave = async () => {
    if (!canEdit || !dirty || saving || !studio) return;
    setSaving(true);
    setSaved(null);
    setError(null);

    try {
      const res = await fetch(`/api/studios/${studio.id}/me/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: value }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ profile: { address: string } }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Не удалось сохранить"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Не удалось сохранить"));

      setInitial(value);
      setSaved("Сохранено");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Информация о мастере</h3>
          <p className="mt-1 text-sm text-neutral-600">Дополните профиль мастера.</p>
        </div>
        <button
          type="button"
          className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          Добавить фото
        </button>
      </div>

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

      <div className="space-y-1">
        <div className="text-xs font-medium text-neutral-600">Адрес</div>
        <input
          className={inputClass}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Город, улица, дом..."
          disabled={!canEdit}
        />
      </div>

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

      <div className="rounded-2xl border p-4">
        <div className="text-sm font-semibold">Текущая студия</div>
        {studio ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-700">
            <div>
              <div>{studio.name}</div>
              <div className="text-xs text-neutral-500">
                Статус: {studio.roleLabel ?? "член студии"}
              </div>
            </div>
            <form action={`/api/studios/${studio.id}/leave`} method="post">
              <button
                type="submit"
                className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
              >
                Выйти из студии
              </button>
            </form>
          </div>
        ) : (
          <div className="mt-2 text-sm text-neutral-600">Вы не привязаны к студии.</div>
        )}
      </div>
    </div>
  );
}
