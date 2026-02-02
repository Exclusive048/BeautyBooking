"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaEntityType } from "@prisma/client";
import type { ApiResponse } from "@/lib/types/api";
import type { MediaAssetDto } from "@/lib/media/types";
import { MEDIA_PORTFOLIO_LIMIT } from "@/lib/media/types";

type Props = {
  entityType: MediaEntityType;
  entityId: string;
  canEdit?: boolean;
};

function buildListUrl(entityType: MediaEntityType, entityId: string): string {
  const params = new URLSearchParams({
    entityType,
    entityId,
    kind: "PORTFOLIO",
  });
  return `/api/media?${params.toString()}`;
}

export function PortfolioEditor({ entityType, entityId, canEdit = true }: Props) {
  const addInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [assets, setAssets] = useState<MediaAssetDto[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(buildListUrl(entityType, entityId), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Failed to load portfolio");
      }
      setAssets(json.data.assets);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load portfolio");
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = useCallback(
    async (file: File, replaceAssetId?: string) => {
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
          throw new Error(json && !json.ok ? json.error.message : "Failed to upload image");
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to upload image");
      } finally {
        setBusy(false);
      }
    },
    [entityType, entityId, load]
  );

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
        const json = (await res.json().catch(() => null)) as ApiResponse<{ result: { id: string } }> | null;
        if (!res.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : "Failed to delete image");
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete image");
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  return (
    <div className="space-y-3">
      {canEdit && assets.length < MEDIA_PORTFOLIO_LIMIT ? (
        <button
          type="button"
          onClick={() => addInputRef.current?.click()}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50"
          disabled={busy}
        >
          Добавить фото
        </button>
      ) : null}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {assets.map((asset) => (
          <div key={asset.id} className="group relative aspect-square overflow-hidden rounded-2xl border bg-neutral-100">
            <button type="button" className="h-full w-full" onClick={() => setPreviewUrl(asset.url)}>
              <img src={asset.url} alt="" className="h-full w-full object-cover" />
            </button>

            {canEdit ? (
              <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => {
                    setReplaceTargetId(asset.id);
                    replaceInputRef.current?.click();
                  }}
                  aria-label="Replace photo"
                  disabled={busy}
                  className="rounded-full bg-white/90 px-2 py-1 text-xs shadow-sm hover:bg-white"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  onClick={() => void remove(asset.id)}
                  aria-label="Delete photo"
                  disabled={busy}
                  className="rounded-full bg-white/90 px-2 py-1 text-xs shadow-sm hover:bg-white"
                >
                  ✖️
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {error ? <div className="text-xs text-red-600">{error}</div> : null}

      {previewUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <button className="absolute inset-0" onClick={() => setPreviewUrl(null)} aria-label="Close preview" />
          <img src={previewUrl} alt="" className="relative max-h-[90vh] max-w-[90vw] rounded-2xl bg-white object-contain" />
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
