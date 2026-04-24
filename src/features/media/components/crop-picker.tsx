"use client";

import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type CropPickerShape = "circle" | "rect";

type CropPickerProps = {
  assetId: string;
  imageUrl: string;
  shape: CropPickerShape;
  aspectRatio?: number;
  initialCropX?: number | null;
  initialCropY?: number | null;
  initialCropWidth?: number | null;
  initialCropHeight?: number | null;
  previewSizes?: number[];
  onSave: (cropX: number, cropY: number, cropWidth: number, cropHeight: number) => void;
  onSkip: () => void;
};

function CropPreview({
  src,
  croppedAreaPercent,
  size,
  shape,
}: {
  src: string;
  croppedAreaPercent: Area | null;
  size: number;
  shape: CropPickerShape;
}) {
  if (!croppedAreaPercent) return null;

  const { x, y, width } = croppedAreaPercent;
  const scale = 100 / width;
  const translateX = -(x * scale);
  const translateY = -(y * scale);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={[
          "overflow-hidden border-2 border-border-subtle bg-bg-input",
          shape === "circle" ? "rounded-full" : "rounded-xl",
        ].join(" ")}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- crop preview uses CSS transform that next/image doesn't support */}
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            width: `${scale * 100}%`,
            height: `${scale * 100}%`,
            transform: `translate(${translateX}%, ${translateY}%)`,
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
      <span className="text-[11px] text-text-sec">{size}px</span>
    </div>
  );
}

export function CropPicker({
  assetId,
  imageUrl,
  shape,
  aspectRatio = 1,
  initialCropX,
  initialCropY,
  initialCropWidth,
  initialCropHeight,
  previewSizes,
  onSave,
  onSkip,
}: CropPickerProps) {
  const t = UI_TEXT.media.crop;

  const hasSavedCrop =
    initialCropX != null &&
    initialCropY != null &&
    initialCropWidth != null &&
    initialCropHeight != null;

  const [crop, setCrop] = useState({
    x: hasSavedCrop ? ((initialCropX! + initialCropWidth! / 2 - 0.5) / 1) * -100 : 0,
    y: hasSavedCrop ? ((initialCropY! + initialCropHeight! / 2 - 0.5) / 1) * -100 : 0,
  });
  const [zoom, setZoom] = useState(hasSavedCrop ? 1 / (initialCropWidth ?? 1) : 1);
  const [croppedAreaPercent, setCroppedAreaPercent] = useState<Area | null>(null);
  const latestCropRef = useRef<{ cropX: number; cropY: number; cropWidth: number; cropHeight: number } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropCompletePercent = useCallback((croppedArea: Area) => {
    latestCropRef.current = {
      cropX: croppedArea.x / 100,
      cropY: croppedArea.y / 100,
      cropWidth: croppedArea.width / 100,
      cropHeight: croppedArea.height / 100,
    };
    setCroppedAreaPercent(croppedArea);
  }, []);

  const save = useCallback(async () => {
    const cropData = latestCropRef.current;
    if (!cropData) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${assetId}/crop`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cropData),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ asset: unknown }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : t.saveFailed);
      }
      onSave(cropData.cropX, cropData.cropY, cropData.cropWidth, cropData.cropHeight);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t.saveFailed);
    } finally {
      setBusy(false);
    }
  }, [assetId, onSave, t.saveFailed]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-sec">{t.hint}</p>

      {/* Cropper area */}
      <div className="relative h-[280px] overflow-hidden rounded-2xl border border-border-subtle bg-black sm:h-[340px]">
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={aspectRatio}
          cropShape={shape === "circle" ? "round" : "rect"}
          showGrid={shape === "rect"}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropCompletePercent}
          style={{
            containerStyle: { borderRadius: "1rem" },
            cropAreaStyle: {
              border: "2px solid rgba(255,255,255,0.8)",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
            },
          }}
        />
      </div>

      {/* Zoom slider */}
      <div className="flex items-center gap-3 px-1" role="group" aria-label={t.zoomLabel}>
        <button
          type="button"
          aria-label="Уменьшить"
          onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-sec hover:bg-bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label={t.zoomLabel}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border-subtle accent-primary"
        />
        <button
          type="button"
          aria-label="Увеличить"
          onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-sec hover:bg-bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Preview */}
      {previewSizes && previewSizes.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-sec">{t.previewLabel}</p>
          <div className="flex flex-wrap items-end gap-4">
            {previewSizes.map((size) => (
              <CropPreview
                key={size}
                src={imageUrl}
                croppedAreaPercent={croppedAreaPercent}
                size={size}
                shape={shape}
              />
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy || !latestCropRef.current}>
          {busy ? "Сохраняем..." : t.save}
        </Button>
        <Button type="button" variant="secondary" onClick={onSkip} disabled={busy}>
          {t.skip}
        </Button>
      </div>
    </div>
  );
}
