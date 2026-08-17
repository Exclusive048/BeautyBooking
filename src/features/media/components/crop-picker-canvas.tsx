"use client";

import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";

export type CropPickerCanvasProps = {
  image: string;
  crop: Point;
  zoom: number;
  aspect: number;
  cropShape: "round" | "rect";
  showGrid: boolean;
  onCropChange: (crop: Point) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (croppedArea: Area) => void;
};

/**
 * Холст кроппера. Отдельный модуль по двум причинам сразу.
 *
 * 1. `next/dynamic` — это граница чанка, а не условие внутри компонента:
 *    только импорт из отдельного файла уводит `react-easy-crop` из бандла
 *    (PERF-17).
 * 2. `Cropper` — класс с `defaultProps`, и половина `CropperProps` объявлена
 *    обязательной именно потому, что значения приходят оттуда. При прямом
 *    JSX-использовании TypeScript про `defaultProps` знает, а через
 *    `dynamic` тип схлопывается до `ComponentType<CropperProps>` и требует
 *    `rotation`, `minZoom`, `maxZoom` и ещё шесть пропов. Узкий тип здесь
 *    оставляет вызывающему ровно тот набор, который он и передавал.
 *
 * Инлайновые стили перенесены дословно из `crop-picker.tsx`.
 */
export default function CropPickerCanvas(props: CropPickerCanvasProps) {
  return (
    <Cropper
      {...props}
      style={{
        containerStyle: { borderRadius: "1rem" },
        cropAreaStyle: {
          border: "2px solid rgba(255,255,255,0.8)",
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
        },
      }}
    />
  );
}
