"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FocalImage } from "@/components/ui/focal-image";
import { ModalSurface } from "@/components/ui/modal-surface";
import { CropPicker } from "@/features/media/components/crop-picker";
import type { ApiResponse } from "@/lib/types/api";
import type { MediaAssetDto } from "@/lib/media/types";
import { UI_TEXT } from "@/lib/ui/text";

const SITE_ENTITY_TYPE = "SITE";
const SITE_ENTITY_ID = "site";
const HERO_KIND = "PORTFOLIO";

function buildListUrl(): string {
  const params = new URLSearchParams({
    entityType: SITE_ENTITY_TYPE,
    entityId: SITE_ENTITY_ID,
    kind: HERO_KIND,
  });
  return `/api/media?${params.toString()}`;
}

export function LoginHeroImageManager() {
  const t = UI_TEXT.admin.media;
  const tc = UI_TEXT.media.crop;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [asset, setAsset] = useState<MediaAssetDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingCrop, setPickingCrop] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(buildListUrl(), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;

      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.loadFailed);
      }

      setAsset(json.data.assets[0] ?? null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : t.loadFailed;
      setError(message);
    } finally {
      setLoaded(true);
    }
  }, [t.loadFailed]);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);

      try {
        const form = new FormData();
        form.set("entityType", SITE_ENTITY_TYPE);
        form.set("entityId", SITE_ENTITY_ID);
        form.set("kind", HERO_KIND);
        if (asset) {
          form.set("replaceAssetId", asset.id);
        }
        form.set("file", file);

        const res = await fetch("/api/media", { method: "POST", body: form });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ asset: MediaAssetDto }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : t.uploadFailed);
        }

        setAsset(json.data.asset);
        setPickingCrop(true);
      } catch (uploadError) {
        const message = uploadError instanceof Error ? uploadError.message : t.uploadFailed;
        setError(message);
      } finally {
        setBusy(false);
      }
    },
    [asset, t.uploadFailed]
  );

  const remove = useCallback(async () => {
    if (!asset) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${asset.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ result: { id: string } }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.deleteFailed);
      }
      setAsset(null);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : t.deleteFailed;
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [asset, t.deleteFailed]);

  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [load, loaded]);

  return (
    <div className="space-y-3 rounded-2xl border border-border-subtle bg-bg-card p-5">
      <div>
        <h3 className="text-lg font-semibold">{t.loginHeroTitle}</h3>
        <p className="text-sm text-text-sec">{t.loginHeroDescription}</p>
      </div>

      <div className="relative h-40 w-full overflow-hidden rounded-2xl border border-border-subtle bg-bg-input">
        {asset ? (
          <FocalImage
            src={asset.url}
            alt={t.loginHeroTitle}
            cropX={asset.cropX}
            cropY={asset.cropY}
            cropWidth={asset.cropWidth}
            cropHeight={asset.cropHeight}
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-text-sec">
            {t.emptyImage}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          variant="secondary"
          size="sm"
          className="rounded-xl"
        >
          {asset ? t.replaceImage : t.uploadImage}
        </Button>

        {asset ? (
          <Button
            type="button"
            onClick={() => setPickingCrop(true)}
            disabled={busy}
            variant="secondary"
            size="sm"
            className="rounded-xl"
          >
            {tc.setCrop}
          </Button>
        ) : null}

        {asset ? (
          <Button
            type="button"
            onClick={remove}
            disabled={busy}
            variant="secondary"
            size="sm"
            className="rounded-xl"
          >
            {t.removeImage}
          </Button>
        ) : null}
      </div>

      {error ? <div className="text-sm text-rose-300">{error}</div> : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void upload(file);
          }
          event.currentTarget.value = "";
        }}
      />

      {asset ? (
        <ModalSurface
          open={pickingCrop}
          onClose={() => setPickingCrop(false)}
          title={tc.titleBanner}
        >
          <CropPicker
            assetId={asset.id}
            imageUrl={asset.url}
            shape="rect"
            aspectRatio={16 / 9}
            initialCropX={asset.cropX}
            initialCropY={asset.cropY}
            initialCropWidth={asset.cropWidth}
            initialCropHeight={asset.cropHeight}
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
