"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Pencil, Star, Trash2 } from "lucide-react";
import { ResilientImage } from "@/components/ui/resilient-image";
import type { MediaEntityType } from "@prisma/client";
import type { ApiResponse } from "@/lib/types/api";
import type { MediaAssetDto } from "@/lib/media/types";
import { MEDIA_PORTFOLIO_LIMIT } from "@/lib/media/types";
import { usePlanFeatures } from "@/lib/billing/use-plan-features";
import { Button } from "@/components/ui/button";
import { useOverlayA11y } from "@/components/ui/use-modal-a11y";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  entityType: MediaEntityType;
  entityId: string;
  canEdit?: boolean;
  /**
   * CATALOG-MAIN-PHOTO — выбор главного фото карточки каталога. Передаётся
   * только портфолио студии (`entityId` — её `Provider.id`); `undefined`
   * выключает выбор совсем, `null` — «не выбрано, главным будет самое новое».
   */
  initialCatalogCoverAssetId?: string | null;
};

function buildListUrl(entityType: MediaEntityType, entityId: string): string {
  const params = new URLSearchParams({
    entityType,
    entityId,
    kind: "PORTFOLIO",
  });
  return `/api/media?${params.toString()}`;
}

export function PortfolioEditor({
  entityType,
  entityId,
  canEdit = true,
  initialCatalogCoverAssetId,
}: Props) {
  const addInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [assets, setAssets] = useState<MediaAssetDto[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const closePreview = useCallback(() => setPreviewUrl(null), []);

  // UI-13 — у лайтбокса не было НИЧЕГО из контракта диалога: ни Escape, ни
  // focus-trap, ни возврата фокуса, ни блокировки прокрутки фона. Закрыть
  // его можно было только кликом по невидимой кнопке-подложке, то есть с
  // клавиатуры выход находился наощупь, а колесо прокручивало страницу
  // ПОД полноэкранным чёрным слоем. Исключение в ESLint обосновано верно,
  // но оно про позиционирование — a11y-контракт им не покрывается.
  useOverlayA11y({ open: previewUrl !== null, onClose: closePreview, containerRef: previewRef });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coverEnabled = initialCatalogCoverAssetId !== undefined && entityType === "STUDIO";
  const [coverId, setCoverId] = useState<string | null>(initialCatalogCoverAssetId ?? null);
  const [dropActive, setDropActive] = useState(false);
  const plan = usePlanFeatures(entityType === "STUDIO" ? "STUDIO" : "MASTER");
  const portfolioText = UI_TEXT.master.profile.portfolio;
  const mediaText = UI_TEXT.media.portfolio;
  const portfolioLimit =
    entityType === "STUDIO"
      ? plan.features
        ? plan.limit("maxPortfolioPhotosStudioDesign")
        : MEDIA_PORTFOLIO_LIMIT
      : MEDIA_PORTFOLIO_LIMIT;
  const limitReached = portfolioLimit !== null && assets.length >= portfolioLimit;
  const limitWarning =
    portfolioLimit !== null && assets.length >= Math.max(portfolioLimit - 1, 1);
  const limitLabel =
    portfolioLimit === null ? UI_TEXT.common.noLimit : `${assets.length} / ${portfolioLimit}`;

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(buildListUrl(entityType, entityId), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : mediaText.loadFailed);
      }
      setAssets(json.data.assets);
    } catch (e) {
      setError(e instanceof Error ? e.message : mediaText.loadFailed);
    }
  }, [entityType, entityId, mediaText.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = useCallback(
    async (file: File, replaceAssetId?: string) => {
      if (!replaceAssetId && limitReached) {
        setError(UI_TEXT.master.profile.errors.portfolioLimitReached);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const form = new FormData();
        form.set("entityType", entityType);
        form.set("entityId", entityId);
        form.set("kind", "PORTFOLIO");
        if (replaceAssetId) form.set("replaceAssetId", replaceAssetId);
        form.set("file", file);

        const res = await fetch("/api/media", { method: "POST", body: form });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ asset: MediaAssetDto }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : mediaText.uploadFailed);
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : mediaText.uploadFailed);
      } finally {
        setBusy(false);
      }
    },
    [entityType, entityId, limitReached, load, mediaText.uploadFailed]
  );

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ result: { id: string } }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : mediaText.deleteFailed);
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : mediaText.deleteFailed);
      } finally {
        setBusy(false);
      }
    },
    [load, mediaText.deleteFailed]
  );

  const makeCover = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/studios/${encodeURIComponent(entityId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catalogCoverAssetId: id }),
        });
        const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : mediaText.makeCoverFailed);
        }
        setCoverId(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : mediaText.makeCoverFailed);
      } finally {
        setBusy(false);
      }
    },
    [entityId, mediaText.makeCoverFailed]
  );

  // Без выбора (или если выбранное удалили) главным считается самое новое —
  // так же решает карточка каталога (`loadStudioCardPhotos`).
  const effectiveCoverId = coverEnabled
    ? (coverId && assets.some((asset) => asset.id === coverId) ? coverId : (assets[0]?.id ?? null))
    : null;

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canEdit || busy || limitReached) return;
      event.preventDefault();
      setDropActive(true);
    },
    [busy, canEdit, limitReached]
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canEdit || busy || limitReached) return;
      event.preventDefault();
      setDropActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        void upload(file);
      }
    },
    [busy, canEdit, limitReached, upload]
  );

  return (
    <div className="space-y-3">
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="secondary"
            onClick={() => addInputRef.current?.click()}
            disabled={busy || limitReached}
          >
            {limitReached ? mediaText.limitReached : mediaText.addPhoto}
          </Button>
          <div className={`text-xs ${limitWarning ? "text-amber-600" : "text-text-sec"}`}>
            {limitLabel}
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <div
          role="button"
          tabIndex={0}
          className={`flex min-h-[140px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center text-sm transition ${
            dropActive ? "border-primary bg-primary/10" : "border-border-subtle bg-bg-card/80"
          } ${busy || limitReached ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
          onClick={() => {
            if (!busy && !limitReached) {
              addInputRef.current?.click();
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !busy && !limitReached) {
              event.preventDefault();
              addInputRef.current?.click();
            }
          }}
        >
          <div className="text-sm font-medium text-text-main">{portfolioText.dropTitle}</div>
          <div className="mt-1 text-xs text-text-sec">
            {portfolioText.dropSubtitle} {busy ? portfolioText.uploadingSuffix : ""}
          </div>
        </div>
      ) : null}

      {coverEnabled && assets.length > 0 ? (
        <p className="text-xs text-text-sec">{mediaText.coverHint}</p>
      ) : null}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {assets.map((asset, index) => (
          <div key={asset.id} className="group relative aspect-square overflow-hidden rounded-2xl border border-border-subtle bg-bg-input">
            <Button
              variant="wrapper"
              className="relative h-full w-full"
              onClick={() => setPreviewUrl(asset.url)}
              aria-label={mediaText.openPreviewAriaTemplate.replace("{n}", String(index + 1))}
            >
              <ResilientImage
                src={asset.url}
                alt={mediaText.photoAltTemplate.replace("{n}", String(index + 1))}
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover"
              />
            </Button>

            {asset.id === effectiveCoverId ? (
              <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-gradient px-2 py-0.5 text-[10px] font-semibold text-white shadow-card">
                <Star className="h-3 w-3 fill-current" aria-hidden />
                {mediaText.coverBadge}
              </span>
            ) : null}

            {coverEnabled && canEdit && effectiveCoverId !== null && asset.id !== effectiveCoverId ? (
              <Button
                variant="wrapper"
                size="none"
                onClick={() => void makeCover(asset.id)}
                disabled={busy}
                aria-label={`${mediaText.makeCover}: ${mediaText.photoAltTemplate.replace("{n}", String(index + 1))}`}
                className="absolute bottom-2 left-2 inline-flex h-7 items-center gap-1 rounded-full border border-border-subtle bg-bg-card/90 px-2.5 text-[11px] font-medium text-text-main opacity-0 shadow-card transition hover:bg-bg-input focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <Star className="h-3.5 w-3.5" aria-hidden />
                {mediaText.makeCover}
              </Button>
            ) : null}

            {canEdit ? (
              <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="none"
                  onClick={() => {
                    setReplaceTargetId(asset.id);
                    replaceInputRef.current?.click();
                  }}
                  aria-label={mediaText.replacePhotoAria}
                  disabled={busy}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-bg-card/90 text-text-main shadow-card hover:bg-bg-input"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="none"
                  onClick={() => void remove(asset.id)}
                  aria-label={mediaText.removePhotoAria}
                  disabled={busy}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-bg-card/90 text-text-main shadow-card hover:bg-bg-input"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {error ? <div className="text-xs text-red-600">{error}</div> : null}

      {previewUrl ? (
        <div
          ref={previewRef}
          role="dialog"
          aria-modal="true"
          aria-label={mediaText.closePreviewAria}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <Button variant="wrapper" className="absolute inset-0" onClick={closePreview} aria-label={mediaText.closePreviewAria} />
          <div className="relative h-[90vh] w-[90vw]">
            <ResilientImage
              src={previewUrl}
              alt={mediaText.previewAlt}
              sizes="90vw"
              fit="contain"
              className="rounded-2xl bg-bg-card object-contain"
              unoptimized
            />
          </div>
        </div>
      ) : null}

      <input
        ref={addInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void upload(file);
          }
          e.currentTarget.value = "";
        }}
      />

      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replaceTargetId) {
            void upload(file, replaceTargetId);
          }
          setReplaceTargetId(null);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
