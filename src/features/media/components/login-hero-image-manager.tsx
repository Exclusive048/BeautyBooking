"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FocalImage } from "@/components/ui/focal-image";
import { ModalSurface } from "@/components/ui/modal-surface";
import { FocalPointPicker } from "@/features/media/components/focal-point-picker";
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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [asset, setAsset] = useState<MediaAssetDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingFocal, setPickingFocal] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(buildListUrl(), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;

      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : UI_TEXT.admin.media.loadFailed);
      }

      setAsset(json.data.assets[0] ?? null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : UI_TEXT.admin.media.loadFailed;
      setError(message);
    } finally {
      setLoaded(true);
    }
  }, []);

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
          throw new Error(json && !json.ok ? json.error.message : UI_TEXT.admin.media.uploadFailed);
        }

        setAsset(json.data.asset);
        setPickingFocal(true);
      } catch (uploadError) {
        const message = uploadError instanceof Error ? uploadError.message : UI_TEXT.admin.media.uploadFailed;
        setError(message);
      } finally {
        setBusy(false);
      }
    },
    [asset]
  );

  const remove = useCallback(async () => {
    if (!asset) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${asset.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ result: { id: string } }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : UI_TEXT.admin.media.deleteFailed);
      }
      setAsset(null);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : UI_TEXT.admin.media.deleteFailed;
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [asset]);

  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [load, loaded]);

  return (
    <div className="space-y-3 rounded-2xl border p-5">
      <div>
        <h3 className="text-lg font-semibold">{UI_TEXT.admin.media.loginHeroTitle}</h3>
        <p className="text-sm text-neutral-600">{UI_TEXT.admin.media.loginHeroDescription}</p>
      </div>

      <div className="relative h-40 w-full overflow-hidden rounded-2xl border bg-neutral-100">
        {asset ? (
          <FocalImage
            src={asset.url}
            alt={UI_TEXT.admin.media.loginHeroTitle}
            focalX={asset.focalX}
            focalY={asset.focalY}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
            {UI_TEXT.admin.media.emptyImage}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {asset ? UI_TEXT.admin.media.replaceImage : UI_TEXT.admin.media.uploadImage}
        </button>

        {asset ? (
          <button
            type="button"
            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
            onClick={() => setPickingFocal(true)}
            disabled={busy}
          >
            Точка фокуса
          </button>
        ) : null}

        {asset ? (
          <button
            type="button"
            className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
            onClick={remove}
            disabled={busy}
          >
            {UI_TEXT.admin.media.removeImage}
          </button>
        ) : null}
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

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
          open={pickingFocal}
          onClose={() => setPickingFocal(false)}
          title="Точка фокуса"
        >
          <FocalPointPicker
            assetId={asset.id}
            imageUrl={asset.url}
            initialFocalX={asset.focalX}
            initialFocalY={asset.focalY}
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

