"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BookingStatus } from "@prisma/client";
import { CLIENT_TAGS } from "@/lib/crm/tags";
import { UI_FMT } from "@/lib/ui/fmt";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "@/components/ui/resilient-image";
import { Drawer } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import * as UI_TEXT from "@/lib/ui/text";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { FileInput } from "@/components/ui/file-input";

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
  /** TZ-DISPLAY-SALON-PARITY-01: salon (provider) tz for the visit-history dates. */
  timeZone: string;
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
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [photos, setPhotos] = useState<CardPhoto[]>([]);
  const [history, setHistory] = useState<CardData["history"]>([]);
  const [visitsCount, setVisitsCount] = useState(0);
  const [daysSinceLastVisit, setDaysSinceLastVisit] = useState<number | null>(null);
  // TZ-DISPLAY-SALON-PARITY-01: salon tz from the card DTO — visit-history dates
  // render in the cabinet's provider tz, not the viewer's browser tz.
  const [cardTimeZone, setCardTimeZone] = useState<string | null>(null);
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
    setCardTimeZone(null);
    try {
      const data = await fetchJsonWithAuth<CardData>(`${baseUrl}/${encodeURIComponent(clientKey)}/card${query}`, { cache: "no-store" });
      setNotes(data.card.notes ?? "");
      setTags(data.card.tags ?? []);
      setPhotos(data.card.photos ?? []);
      setHistory(data.history ?? []);
      setVisitsCount(data.visitsCount ?? 0);
      setDaysSinceLastVisit(data.daysSinceLastVisit ?? null);
      setCardTimeZone(data.timeZone ?? null);
    } catch (err) {
      setError(serverMessageOr(err, "Не удалось загрузить карточку клиента. Попробуйте ещё раз."));
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
        setError(`Больше ${TAG_LIMIT} меток выбрать нельзя.`);
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
      await fetchJsonWithAuth<{ card: { id: string; notes: string | null; tags: string[] } }>(`${baseUrl}/${encodeURIComponent(clientKey)}/card${query}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, tags }),
      });
      onUpdated?.();
    } catch (err) {
      setError(serverMessageOr(err, "Не удалось сохранить карточку"));
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File): Promise<void> => {
    if (!clientKey) return;
    if (photos.length >= PHOTO_LIMIT) {
      setError(`Больше ${PHOTO_LIMIT} фото добавить нельзя.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const data = await fetchJsonWithAuth<{ photo: CardPhoto }>(`${baseUrl}/${encodeURIComponent(clientKey)}/card/photos${query}`, {
        method: "POST",
        body: form,
      });
      setPhotos((current) => [data.photo, ...current]);
      onUpdated?.();
    } catch (err) {
      setError(serverMessageOr(err, "Не удалось загрузить фото"));
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = async (photoId: string): Promise<void> => {
    if (!clientKey) return;
    setSaving(true);
    setError(null);
    try {
      await fetchJsonWithAuth<{ deleted: boolean }>(`${baseUrl}/${encodeURIComponent(clientKey)}/card/photos/${photoId}${query}`, {
        method: "DELETE",
      });
      setPhotos((current) => current.filter((photo) => photo.id !== photoId));
      onUpdated?.();
    } catch (err) {
      setError(serverMessageOr(err, "Не удалось удалить фото"));
    } finally {
      setSaving(false);
    }
  };

  if (!clientKey) return null;

  // MODAL-UNIFY-IMPL-A: shell migrated to unified `<Drawer>`. Public
  // API and ALL fetch/mutation/state logic above are preserved
  // verbatim — only the outer overlay/portal/scroll-lock is swapped.
  return (
    <Drawer
      open
      onClose={onClose}
      side="right"
      size="lg"
      title={clientName}
      ariaLabel={clientName}
      headerActions={
        <div className="hidden text-xs text-text-sec sm:block">
          <div>{clientPhone}</div>
          <div>Посещений: {visitsCount} • {formatDaysAgo(daysSinceLastVisit)}</div>
        </div>
      }
    >
      <div className="p-5">
        {loading ? <div className="text-sm text-text-sec">Загружаем...</div> : null}
        {error ? (
          <div role="alert" className="mt-4 rounded-2xl border border-danger-border bg-danger-surface p-3 text-sm text-danger-text">{error}</div>
        ) : null}

        {!loading ? (
          <div className="mt-4 space-y-5">
            <section className="rounded-2xl border border-border-subtle bg-bg-input/60 p-4">
              <div className="text-sm font-semibold text-text-main">Заметки</div>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={UI_TEXT.cabinetMaster.clients.cardNotePlaceholder}
                className="mt-2"
                rows={5}
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="text-xs text-text-sec">{notes.trim().length}/2000</div>
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? "Сохраняем..." : "Сохранить"}
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-border-subtle bg-bg-input/60 p-4">
              <div className="text-sm font-semibold text-text-main">Метки</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <Button
                    key={tag.id}
                    variant={tag.selected ? "primary" : "secondary"}
                    size="none"
                    onClick={() => toggleTag(tag.id)}
                    className="rounded-full border px-3 py-1 text-xs"
                  >
                    {tag.emoji} {tag.label}
                  </Button>
                ))}
              </div>
              <div className="mt-2 text-xs text-text-sec">Можно выбрать до {TAG_LIMIT} меток.</div>
            </section>

            <section className="rounded-2xl border border-border-subtle bg-bg-input/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-text-main">Фото работ</div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={saving || photos.length >= PHOTO_LIMIT}
                >
                  {photos.length >= PHOTO_LIMIT ? "Больше нельзя" : "Добавить"}
                </Button>
              </div>
              <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-3">
                {photos.map((photo, index) => (
                  <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-2xl border bg-muted">
                    {/* PWA-FIX-01: фото карточки клиента приватное
                        (CLIENT_CARD/CLIENT_CARD_PHOTO — только владелец карточки),
                        а оптимизатор `next/image` забирает байты внутренним
                        запросом без куки сессии → 401 → плейсхолдер. Байты берёт
                        браузер сам; тот же вывод у вложений чата и аватара
                        клиента. */}
                    <ResilientImage
                      src={photo.url}
                      alt={UI_TEXT.cabinetMaster.clients.cardPhotoAltTemplate
                        .replace("{name}", clientName)
                        .replace("{n}", String(index + 1))}
                      sizes="(max-width: 640px) 50vw, 33vw"
                      unoptimized
                      className="object-cover"
                    />
                    <Button
                      variant="ghost"
                      size="none"
                      onClick={() => void removePhoto(photo.id)}
                      className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-2xs opacity-0 transition group-hover:opacity-100"
                    >
                      ✖
                    </Button>
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
                        <span>{UI_FMT.dateTimeShort(item.date, { timeZone: cardTimeZone ?? "Europe/Moscow" })}</span>
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

        <FileInput
          ref={fileRef}
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void uploadPhoto(file);
            }
            event.currentTarget.value = "";
          }}
        />
      </div>
    </Drawer>
  );
}
