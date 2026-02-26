"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Button } from "@/components/ui/button";
import { providerPublicUrl } from "@/lib/public-urls";
import type { ApiResponse } from "@/lib/types/api";

type VisualSearchProviderResult = {
  provider: {
    id: string;
    name: string;
    publicUsername: string | null;
    avatarUrl: string | null;
    ratingAvg: number;
  };
  matchingPhotos: Array<{ assetId: string; url: string; similarity: number }>;
  score: number;
  category: string;
};

type VisualSearchResponse = {
  results: VisualSearchProviderResult[];
  category: string;
};

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const CATEGORY_LABELS: Record<string, string> = {
  manicure: "Маникюр",
  pedicure: "Педикюр",
  lashes: "Ресницы",
  brows: "Брови",
  makeup: "Макияж",
  hairstyle: "Причёски",
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function VisualSearchModal({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<VisualSearchProviderResult[]>([]);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setMessage(null);
    setResults([]);
    setCategory(null);
  }, []);

  const handleClose = useCallback(() => {
    if (loading) return;
    resetState();
    onClose();
  }, [loading, onClose, resetState]);

  const runSearch = useCallback(async (file: File) => {
    setLoading(true);
    setMessage(null);
    setResults([]);
    setCategory(null);
    try {
      const formData = new FormData();
      formData.set("image", file);
      const res = await fetch("/api/visual-search", { method: "POST", body: formData });
      const json = (await res.json().catch(() => null)) as ApiResponse<VisualSearchResponse> | null;
      if (!json) {
        throw new Error("Не удалось получить ответ сервера.");
      }
      if (!res.ok || !json.ok) {
        const errorMessage =
          json && !json.ok ? json.error.message : "Не удалось выполнить поиск по фото.";
        setMessage(errorMessage);
        return;
      }
      setResults(json.data.results);
      setCategory(json.data.category);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить поиск по фото.");
    } finally {
      setLoading(false);
    }
  }, []);

  const acceptFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setMessage("Поддерживаются только JPEG, PNG или WebP.");
        return;
      }
      setSelectedFile(file);
      await runSearch(file);
    },
    [runSearch]
  );

  const onFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      void acceptFile(file);
      if (event.target.value) {
        event.target.value = "";
      }
    },
    [acceptFile]
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragActive(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      void acceptFile(file);
    },
    [acceptFile]
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }, []);

  const categoryLabel = category ? CATEGORY_LABELS[category] ?? category : null;

  return (
    <ModalSurface open={open} onClose={handleClose} className="max-w-4xl p-0">
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
        <div>
          <div className="text-lg font-semibold text-text-main">Найти по фото</div>
          <div className="text-sm text-text-sec">
            Загрузите фото работы, и мы подберём похожие варианты.
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={loading}>
          Закрыть
        </Button>
      </div>

      <div className="grid gap-6 px-6 py-5 md:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <div
            className={[
              "flex min-h-[220px] flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center transition",
              dragActive ? "border-primary bg-primary/5" : "border-border-subtle bg-bg-card/60",
            ].join(" ")}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="preview"
                className="max-h-[200px] w-full rounded-2xl object-contain"
              />
            ) : (
              <>
                <div className="text-sm font-semibold text-text-main">
                  Перетащите фото сюда или выберите файл
                </div>
                <div className="mt-1 text-xs text-text-sec">JPEG, PNG или WebP</div>
              </>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={onFileChange}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
            >
              Загрузить фото
            </Button>
            {selectedFile ? (
              <Button type="button" variant="secondary" onClick={resetState} disabled={loading}>
                Сбросить
              </Button>
            ) : null}
          </div>

          {loading ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-card/80 p-3 text-sm text-text-sec">
              Анализируем фото…
            </div>
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {message}
            </div>
          ) : null}

          {categoryLabel && results.length > 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Ищем похожие работы: {categoryLabel}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {results.length === 0 && !loading ? (
            <div className="rounded-2xl border border-border-subtle bg-bg-card/70 p-4 text-sm text-text-sec">
              Результаты появятся здесь после загрузки фото.
            </div>
          ) : null}

          <div className="space-y-3">
            {results.map((item) => (
              <VisualSearchResultCard key={item.provider.id} item={item} />
            ))}
          </div>
        </div>
      </div>
    </ModalSurface>
  );
}

function VisualSearchResultCard({ item }: { item: VisualSearchProviderResult }) {
  const ratingLabel =
    item.provider.ratingAvg > 0 ? item.provider.ratingAvg.toFixed(1) : "0.0";
  const href = providerPublicUrl(
    { id: item.provider.id, publicUsername: item.provider.publicUsername },
    "visual-search"
  );

  return (
    <article className="rounded-3xl border border-border-subtle bg-bg-card/80 p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {item.provider.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.provider.avatarUrl}
              alt={item.provider.name}
              className="h-11 w-11 rounded-full object-cover ring-1 ring-border-subtle"
              loading="lazy"
            />
          ) : (
            <div className="h-11 w-11 rounded-full bg-muted" />
          )}
          <div>
            <div className="text-sm font-semibold text-text-main">{item.provider.name}</div>
            <div className="text-xs text-text-sec">Рейтинг: {ratingLabel}</div>
          </div>
        </div>
        <Link href={href} className="text-sm font-semibold text-primary">
          Записаться
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {item.matchingPhotos.map((photo) => (
          <div
            key={photo.assetId}
            className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-input/70"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="h-20 w-full object-cover" loading="lazy" />
          </div>
        ))}
      </div>
    </article>
  );
}
