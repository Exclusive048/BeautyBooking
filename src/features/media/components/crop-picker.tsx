"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Area } from "react-easy-crop";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/Skeleton";
import { cropAreaImageStyle, toCropArea } from "@/lib/media/crop-geometry";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { RangeInput } from "@/components/ui/range-input";

/**
 * PERF-17 — `react-easy-crop` статическим импортом отсюда ехал восьми
 * маршрутам сразу (профиль мастера, портфолио, профиль клиента, четыре
 * страницы настроек студии, настройки админа): `CropPicker` импортируют
 * четыре родителя, и хотя сам он рендерится только после выбора файла,
 * граница чанка проходит по импорту, а не по рендеру.
 *
 * Граница поставлена внутри `CropPicker`, а не в четырёх родителях: вес —
 * в библиотеке, а не в этом файле, поэтому одной точки хватает, и новый
 * пятый родитель получит отложенную загрузку не задумываясь об этом.
 *
 * `ssr: false` ничего не меняет по смыслу — кроппер работает с DOM-мерами
 * контейнера и на сервере полезной разметки не давал.
 *
 * Скелет накрывает область кроппера целиком (родитель `relative` с
 * фиксированной высотой), поэтому подстановка проходит без сдвига.
 */
const CropPickerCanvas = dynamic(() => import("@/features/media/components/crop-picker-canvas"), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 h-full w-full rounded-2xl" />,
});

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

/**
 * CROP-PREVIEW-01 — миниатюра показывает ровно то, что в рамке кроппера.
 * Геометрия — общая с показом сохранённого аватара (`cropAreaImageStyle`),
 * поэтому превью и итог не могут разойтись между собой. Бокс держит то же
 * соотношение сторон, что рамка (`aspectRatio`), иначе картинка исказилась бы.
 */
function CropPreview({
  src,
  croppedAreaPercent,
  size,
  aspectRatio,
  shape,
}: {
  src: string;
  croppedAreaPercent: Area | null;
  size: number;
  aspectRatio: number;
  shape: CropPickerShape;
}) {
  const area = croppedAreaPercent
    ? toCropArea(
        croppedAreaPercent.x / 100,
        croppedAreaPercent.y / 100,
        croppedAreaPercent.width / 100,
        croppedAreaPercent.height / 100,
      )
    : null;
  if (!area) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={[
          "relative overflow-hidden border-2 border-border-subtle bg-bg-input",
          shape === "circle" ? "rounded-full" : "rounded-xl",
        ].join(" ")}
        style={{ width: size, height: size / aspectRatio }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- превью кроппера: картинка позиционируется абсолютно и растягивается за пределы бокса, next/image этого не даёт */}
        <img
          src={src}
          alt=""
          draggable={false}
          style={{ ...cropAreaImageStyle(area), display: "block" }}
        />
      </div>
      <span className="text-2xs text-text-sec">{size}px</span>
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

  // CROP-PREVIEW-01: сохранённая область восстанавливается штатным
  // `initialCroppedAreaPercentages`. Прежняя формула писала в `crop` проценты,
  // а `react-easy-crop` ждёт там ПИКСЕЛИ сдвига, и выводила увеличение как
  // `1 / cropWidth`, не учитывая, что при увеличении 1 квадратная рамка на
  // неквадратном фото уже меньше его ширины: «Изменить обрезку» открывалась
  // не на той области, что была сохранена.
  const savedArea = toCropArea(initialCropX, initialCropY, initialCropWidth, initialCropHeight);
  const [initialAreaPercent] = useState<Area | undefined>(() =>
    savedArea
      ? {
          x: savedArea.x * 100,
          y: savedArea.y * 100,
          width: savedArea.width * 100,
          height: savedArea.height * 100,
        }
      : undefined,
  );

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
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
      await fetchJsonWithAuth<{ asset: unknown }>(`/api/media/${assetId}/crop`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cropData),
      });
      onSave(cropData.cropX, cropData.cropY, cropData.cropWidth, cropData.cropHeight);
    } catch (saveError) {
      setError(serverMessageOr(saveError, t.saveFailed));
    } finally {
      setBusy(false);
    }
  }, [assetId, onSave, t.saveFailed]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-sec">{t.hint}</p>

      {/* Cropper area */}
      <div className="relative h-[280px] overflow-hidden rounded-2xl border border-border-subtle bg-black sm:h-[340px]">
        <CropPickerCanvas
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={aspectRatio}
          cropShape={shape === "circle" ? "round" : "rect"}
          showGrid={shape === "rect"}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropCompletePercent}
          initialCroppedAreaPercentages={initialAreaPercent}
        />
      </div>

      {/* Zoom slider */}
      <div className="flex items-center gap-3 px-1" role="group" aria-label={t.zoomLabel}>
        <Button variant="wrapper"
          aria-label={t.zoomOut}
          onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-sec hover:bg-bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </Button>
        <RangeInput
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label={t.zoomLabel}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border-subtle accent-primary"
        />
        <Button variant="wrapper"
          aria-label={t.zoomIn}
          onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-sec hover:bg-bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </Button>
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
                aspectRatio={aspectRatio}
                shape={shape}
              />
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="text-xs text-danger-text">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy || !latestCropRef.current}>
          {busy ? t.saving : t.save}
        </Button>
        <Button type="button" variant="secondary" onClick={onSkip} disabled={busy}>
          {t.skip}
        </Button>
      </div>
    </div>
  );
}
