"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaEntityType } from "@prisma/client";
import type { ApiResponse } from "@/lib/types/api";
import type { MediaAssetDto } from "@/lib/media/types";
import { UI_TEXT } from "@/lib/ui/text";
import { FocalImage } from "@/components/ui/focal-image";
import { ModalSurface } from "@/components/ui/modal-surface";
import { FocalPointPicker } from "@/features/media/components/focal-point-picker";

type Props = {
  entityType: MediaEntityType;
  entityId: string;
  fallbackUrl?: string | null;
  canEdit?: boolean;
  sizeClassName?: string;
  showAddButton?: boolean;
};

function buildListUrl(entityType: MediaEntityType, entityId: string): string {
  const params = new URLSearchParams({
    entityType,
    entityId,
    kind: "AVATAR",
  });
  return `/api/media?${params.toString()}`;
}

export function AvatarEditor({
  entityType,
  entityId,
  fallbackUrl = null,
  canEdit = true,
  sizeClassName = "h-28 w-28",
  showAddButton = true,
}: Props) {
  const t = UI_TEXT.media.avatar;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [assets, setAssets] = useState<MediaAssetDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingFocal, setPickingFocal] = useState(false);
  const [focalAsset, setFocalAsset] = useState<MediaAssetDto | null>(null);
  const openFocalAfterLoadRef = useRef(false);

  const activeAsset = assets[0] ?? null;
  const imageUrl = activeAsset?.url ?? fallbackUrl ?? null;

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(buildListUrl(entityType, entityId), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.loadFailed);
      }
      const nextAssets = json.data.assets;
      setAssets(nextAssets);
      if (openFocalAfterLoadRef.current) {
        openFocalAfterLoadRef.current = false;
        const nextAsset = nextAssets[0] ?? null;
        if (nextAsset) {
          setFocalAsset(nextAsset);
          setPickingFocal(true);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setLoaded(true);
    }
  }, [entityType, entityId, t.loadFailed]);

  const upload = useCallback(
    async (file: File, replaceAssetId?: string) => {
      setBusy(true);
      setError(null);
      try {
        const form = new FormData();
        form.set("entityType", entityType);
        form.set("entityId", entityId);
        form.set("kind", "AVATAR");
        if (replaceAssetId) form.set("replaceAssetId", replaceAssetId);
        form.set("file", file);

        const res = await fetch("/api/media", { method: "POST", body: form });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ asset: MediaAssetDto }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : t.uploadFailed);
        }
        openFocalAfterLoadRef.current = true;
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : t.uploadFailed);
      } finally {
        setBusy(false);
      }
    },
    [entityType, entityId, load, t.uploadFailed]
  );

  const remove = useCallback(async () => {
    if (!activeAsset) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${activeAsset.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ result: { id: string } }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.deleteFailed);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.deleteFailed);
    } finally {
      setBusy(false);
    }
  }, [activeAsset, load, t.deleteFailed]);

  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [loaded, load]);

  const filePickerLabel = useMemo(
    () => (activeAsset ? t.replace : t.upload),
    [activeAsset, t.replace, t.upload]
  );
  const hasFocalPoint = activeAsset?.focalX !== null && activeAsset?.focalY !== null;
  const focalButtonLabel = hasFocalPoint ? "Изменить точку фокуса" : "Задать точку фокуса";

  const pickerAsset = focalAsset ?? activeAsset;

  return (
    <div className="space-y-2">
      <div className={`group relative overflow-hidden rounded-2xl border bg-neutral-100 ${sizeClassName}`}>
        {imageUrl ? (
          <FocalImage
            src={imageUrl}
            alt=""
            focalX={activeAsset?.focalX ?? null}
            focalY={activeAsset?.focalY ?? null}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">{t.noAvatar}</div>
        )}

        {canEdit ? (
          <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              aria-label={filePickerLabel}
              className="rounded-full bg-white/90 px-2 py-1 text-xs shadow-sm hover:bg-white"
            >
              ✎
            </button>
            {activeAsset ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFocalAsset(activeAsset);
                    setPickingFocal(true);
                  }}
                  disabled={busy}
                  aria-label={focalButtonLabel}
                  className="rounded-full bg-white/90 px-2 py-1 text-xs shadow-sm hover:bg-white"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  aria-label={t.remove}
                  className="rounded-full bg-white/90 px-2 py-1 text-xs shadow-sm hover:bg-white"
                >
                ✕
              </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {canEdit && !activeAsset && showAddButton ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50"
          disabled={busy}
        >
          {t.upload}
        </button>
      ) : null}

      {error ? <div className="text-xs text-red-600">{error}</div> : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void upload(file, activeAsset?.id);
          }
          e.currentTarget.value = "";
        }}
      />

      {pickerAsset ? (
        <ModalSurface open={pickingFocal} onClose={() => setPickingFocal(false)} title="Точка фокуса">
          <FocalPointPicker
            assetId={pickerAsset.id}
            imageUrl={pickerAsset.url}
            initialFocalX={pickerAsset.focalX}
            initialFocalY={pickerAsset.focalY}
            onSave={async () => {
              await load();
              setPickingFocal(false);
            }}
            onSkip={() => setPickingFocal(false)}
          />
        </ModalSurface>
      ) : null}
    </div>
  );
}
