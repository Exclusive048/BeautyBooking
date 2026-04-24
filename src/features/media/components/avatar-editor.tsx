"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Crop, Pencil, Trash2 } from "lucide-react";
import type { MediaEntityType } from "@prisma/client";
import type { ApiResponse } from "@/lib/types/api";
import type { MediaAssetDto } from "@/lib/media/types";
import { assetHasCrop } from "@/lib/media/types";
import { UI_TEXT } from "@/lib/ui/text";
import { Button } from "@/components/ui/button";
import { FocalImage } from "@/components/ui/focal-image";
import { ModalSurface } from "@/components/ui/modal-surface";
import { CropPicker } from "@/features/media/components/crop-picker";

type Props = {
  entityType: MediaEntityType;
  entityId: string;
  fallbackUrl?: string | null;
  canEdit?: boolean;
  sizeClassName?: string;
  showAddButton?: boolean;
  interactionVariant?: "default" | "clickable";
  showRemoveAction?: boolean;
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
  interactionVariant = "default",
  showRemoveAction = true,
}: Props) {
  const t = UI_TEXT.media.avatar;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [assets, setAssets] = useState<MediaAssetDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingCrop, setPickingCrop] = useState(false);
  const [cropAsset, setCropAsset] = useState<MediaAssetDto | null>(null);
  const openCropAfterLoadRef = useRef(false);

  const activeAsset = assets[0] ?? null;
  const imageUrl = activeAsset?.url ?? fallbackUrl ?? null;
  const isClickableVariant = interactionVariant === "clickable";

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
      if (openCropAfterLoadRef.current) {
        openCropAfterLoadRef.current = false;
        const nextAsset = nextAssets[0] ?? null;
        if (nextAsset) {
          setCropAsset(nextAsset);
          setPickingCrop(true);
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
        openCropAfterLoadRef.current = true;
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
  const hasCrop = activeAsset ? assetHasCrop(activeAsset) : false;
  const cropButtonLabel = hasCrop ? t.editCrop : t.setCrop;
  const pickerAsset = cropAsset ?? activeAsset;

  const avatarPreview = imageUrl ? (
    <FocalImage
      src={imageUrl}
      alt=""
      focalX={activeAsset?.focalX ?? null}
      focalY={activeAsset?.focalY ?? null}
      cropX={activeAsset?.cropX ?? null}
      cropY={activeAsset?.cropY ?? null}
      cropWidth={activeAsset?.cropWidth ?? null}
      cropHeight={activeAsset?.cropHeight ?? null}
      sizes="(max-width: 768px) 30vw, 200px"
      className="object-cover"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-xs text-text-sec">{t.noAvatar}</div>
  );

  return (
    <div className="space-y-2">
      <div className={`group relative overflow-hidden rounded-2xl border border-border-subtle bg-bg-input ${sizeClassName}`}>
        {canEdit && isClickableVariant ? (
          <Button
            variant="wrapper"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label={filePickerLabel}
            className="group relative block h-full w-full overflow-hidden text-left focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-70"
          >
            {imageUrl ? (
              <FocalImage
                src={imageUrl}
                alt=""
                focalX={activeAsset?.focalX ?? null}
                focalY={activeAsset?.focalY ?? null}
                cropX={activeAsset?.cropX ?? null}
                cropY={activeAsset?.cropY ?? null}
                cropWidth={activeAsset?.cropWidth ?? null}
                cropHeight={activeAsset?.cropHeight ?? null}
                sizes="(max-width: 768px) 30vw, 200px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-text-sec">
                <Camera className="h-4 w-4" />
                <span className="text-[10px] leading-none">{t.noAvatar}</span>
              </div>
            )}
            <div
              className={`pointer-events-none absolute inset-0 bg-black/35 transition-opacity ${
                imageUrl ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : "opacity-100"
              }`}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent px-2 pb-2 pt-5">
              <span className="block text-[10px] font-medium leading-none text-white">
                {imageUrl ? t.replace : t.upload}
              </span>
            </div>
          </Button>
        ) : (
          avatarPreview
        )}

        {canEdit && !isClickableVariant ? (
          <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <Button
              variant="ghost"
              size="none"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              aria-label={filePickerLabel}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-bg-card/90 text-text-main shadow-card hover:bg-bg-input disabled:opacity-60"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {activeAsset ? (
              <>
                <Button
                  variant="ghost"
                  size="none"
                  onClick={() => {
                    setCropAsset(activeAsset);
                    setPickingCrop(true);
                  }}
                  disabled={busy}
                  aria-label={cropButtonLabel}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-bg-card/90 text-text-main shadow-card hover:bg-bg-input disabled:opacity-60"
                >
                  <Crop className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="none"
                  onClick={remove}
                  disabled={busy}
                  aria-label={t.remove}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-bg-card/90 text-text-main shadow-card hover:bg-bg-input disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        {canEdit && isClickableVariant && activeAsset && showRemoveAction ? (
          <Button
            variant="ghost"
            size="none"
            onClick={remove}
            disabled={busy}
            aria-label={t.remove}
            title={t.remove}
            className="absolute right-1.5 top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle bg-bg-card/85 text-text-main backdrop-blur-sm transition-colors hover:bg-bg-input disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      {canEdit && !activeAsset && showAddButton && !isClickableVariant ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-xl"
        >
          {t.upload}
        </Button>
      ) : null}

      {error ? <div className="text-xs text-red-600">{error}</div> : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void upload(file, activeAsset?.id);
          }
          event.currentTarget.value = "";
        }}
      />

      {pickerAsset ? (
        <ModalSurface open={pickingCrop} onClose={() => setPickingCrop(false)} title={UI_TEXT.media.crop.titleAvatar}>
          <CropPicker
            assetId={pickerAsset.id}
            imageUrl={pickerAsset.url}
            shape="circle"
            aspectRatio={1}
            initialCropX={pickerAsset.cropX}
            initialCropY={pickerAsset.cropY}
            initialCropWidth={pickerAsset.cropWidth}
            initialCropHeight={pickerAsset.cropHeight}
            previewSizes={[120, 40]}
            onSave={async () => {
              await load();
              setPickingCrop(false);
            }}
            onSkip={() => setPickingCrop(false)}
          />
        </ModalSurface>
      ) : null}
    </div>
  );
}
