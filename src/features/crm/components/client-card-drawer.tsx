"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookingStatus } from "@prisma/client";
import type { ApiResponse } from "@/lib/types/api";
import { CLIENT_TAGS } from "@/lib/crm/tags";
import { UI_FMT } from "@/lib/ui/fmt";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";

type CardPhoto = {
  id: string;
  url: string;
  caption: string | null;
  createdAt: string;
};

type CardData = {
  card: {
    id: string | null;
    notes: string | null;
    tags: string[];
    photos: CardPhoto[];
  };
  history: Array<{
    bookingId: string;
    date: string;
    serviceName: string;
    amount: number;
    status: BookingStatus;
  }>;
  visitsCount: number;
  daysSinceLastVisit: number | null;
};

type Props = {
  scope: "MASTER" | "STUDIO";
  studioId?: string;
  clientKey: string | null;
  clientName: string;
  clientPhone: string;
  onClose: () => void;
  onUpdated?: () => void;
};

const PHOTO_LIMIT = 3;
const TAG_LIMIT = 9;

function statusLabel(status: BookingStatus): string {
  if (status === "FINISHED") return "Завершена";
  if (status === "CONFIRMED") return "Подтверждена";
  if (status === "PENDING") return "Ожидает";
  if (status === "PREPAID") return "Оплачена";
  if (status === "STARTED" || status === "IN_PROGRESS") return "В работе";
  if (status === "CANCELLED") return "Отменена";
  if (status === "REJECTED") return "Отклонена";
  if (status === "NO_SHOW") return "Не пришёл";
  if (status === "CHANGE_REQUESTED") return "Перенос";
  return status;
}

function formatDaysAgo(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "Сегодня";
  const mod10 = value % 10;
  const mod100 = value % 100;
  const suffix =
    mod10 === 1 && mod100 !== 11
      ? "день"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "дня"
        : "дней";
  return `${value} ${suffix} назад`;
}

export function ClientCardDrawer({
  scope,
  studioId,
  clientKey,
  clientName,
  clientPhone,
  onClose,
  onUpdated,
}: Props) {
  const viewerTimeZone = useViewerTimeZoneContext();
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [photos, setPhotos] = useState<CardPhoto[]>([]);
  const [history, setHistory] = useState<CardData["history"]>([]);
  const [visitsCount, setVisitsCount] = useState(0);
  const [daysSinceLastVisit, setDaysSinceLastVisit] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const baseUrl = scope === "MASTER" ? "/api/master/clients" : "/api/studio/clients";
  const query = scope === "STUDIO" && studioId ? `?studioId=${encodeURIComponent(studioId)}` : "";

  const load = useCallback(async (): Promise<void> => {
    if (!clientKey) return;
    setLoading(true);
    setError(null);
    setNotes("");
    setTags([]);
    setPhotos([]);
    setHistory([]);
    setVisitsCount(0);
    setDaysSinceLastVisit(null);
    try {
      const res = await fetch(`${baseUrl}/${encodeURIComponent(clientKey)}/card${query}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<CardData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setNotes(json.data.card.notes ?? "");
      setTags(json.data.card.tags ?? []);
      setPhotos(json.data.card.photos ?? []);
      setHistory(json.data.history ?? []);
      setVisitsCount(json.data.visitsCount ?? 0);
      setDaysSinceLastVisit(json.data.daysSinceLastVisit ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить карточку клиента");
    } finally {
      setLoading(false);
    }
  }, [baseUrl, clientKey, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableTags = useMemo(
    () => CLIENT_TAGS.map((tag) => ({ ...tag, selected: tags.includes(tag.id) })),
    [tags]
  );

  const toggleTag = (id: string) => {
    setTags((current) => {
      if (current.includes(id)) {
        return current.filter((tag) => tag !== id);
      }
      if (current.length >= TAG_LIMIT) {
        setError(`Можно выбрать не более ${TAG_LIMIT} тегов.`);
        return current;
      }
      return [...current, id];
    });
  };

  const save = async (): Promise<void> => {
    if (!clientKey) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/${encodeURIComponent(clientKey)}/card${query}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, tags }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ card: { id: string; notes: string | null; tags: string[] } }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить карточку");
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File): Promise<void> => {
    if (!clientKey) return;
    if (photos.length >= PHOTO_LIMIT) {
      setError(`Можно добавить максимум ${PHOTO_LIMIT} фото.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`${baseUrl}/${encodeURIComponent(clientKey)}/card/photos${query}`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ photo: CardPhoto }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setPhotos((current) => [json.data.photo, ...current]);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить фото");
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = async (photoId: string): Promise<void> => {
    if (!clientKey) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/${encodeURIComponent(clientKey)}/card/photos/${photoId}${query}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ deleted: boolean }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setPhotos((current) => current.filter((photo) => photo.id !== photoId));
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить фото");
    } finally {
      setSaving(false);
    }
  };

  if (!clientKey) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-auto border-l border-border-subtle bg-bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-text-main">{clientName}</div>
            <div className="text-xs text-text-sec">{clientPhone}</div>
            <div className="mt-1 text-xs text-text-sec">
              Посещений: {visitsCount} • {formatDaysAgo(daysSinceLastVisit)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-xs"
          >
            Закрыть
          </button>
        </div>

        {loading ? <div className="mt-4 text-sm text-text-sec">Загружаем...</div> : null}
        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        {!loading ? (
          <div className="mt-4 space-y-5">
            <section className="rounded-2xl border border-border-subtle bg-bg-input/60 p-4">
              <div className="text-sm font-semibold text-text-main">Заметки</div>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Запишите важные детали о клиенте"
                className="mt-2 w-full rounded-2xl border border-border-subtle bg-bg-card px-3 py-2 text-sm"
                rows={5}
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="text-xs text-text-sec">{notes.trim().length}/2000</div>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-2xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {saving ? "Сохраняем..." : "Сохранить"}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-border-subtle bg-bg-input/60 p-4">
              <div className="text-sm font-semibold text-text-main">Теги</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      tag.selected
                        ? "border-primary/40 bg-primary/10 text-text-main"
                        : "border-border-subtle text-text-sec hover:bg-bg-card"
                    }`}
                  >
                    {tag.emoji} {tag.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-text-sec">Можно выбрать до {TAG_LIMIT} тегов.</div>
            </section>

            <section className="rounded-2xl border border-border-subtle bg-bg-input/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-text-main">Фото работ</div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={saving || photos.length >= PHOTO_LIMIT}
                  className="rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5 text-xs disabled:opacity-60"
                >
                  {photos.length >= PHOTO_LIMIT ? "Лимит" : "Добавить"}
                </button>
              </div>
              <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-3">
                {photos.map((photo) => (
                  <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-2xl border bg-neutral-100">
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => void removePhoto(photo.id)}
                      className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] opacity-0 transition group-hover:opacity-100"
                    >
                      ✖
                    </button>
                  </div>
                ))}
                {photos.length === 0 ? (
                  <div className="text-xs text-text-sec">Фото пока нет.</div>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-border-subtle bg-bg-input/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-text-main">История визитов</div>
                <a
                  href={scope === "MASTER" ? "/cabinet/master/dashboard" : "/cabinet/studio/calendar"}
                  className="rounded-lg border border-border-subtle bg-bg-card px-3 py-1.5 text-xs hover:bg-bg-input"
                >
                  Записать снова
                </a>
              </div>
              {history.length === 0 ? (
                <div className="mt-3 text-xs text-text-sec">История пока пуста.</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {history.map((item) => (
                    <div key={item.bookingId} className="rounded-2xl border border-border-subtle bg-bg-card px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium text-text-main">{item.serviceName}</div>
                        <div className="text-text-sec">{statusLabel(item.status)}</div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-text-sec">
                        <span>{UI_FMT.dateTimeShort(item.date, { timeZone: viewerTimeZone })}</span>
                        <span>•</span>
                        <span>{UI_FMT.priceLabel(item.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void uploadPhoto(file);
          }
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
