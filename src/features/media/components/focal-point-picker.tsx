"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types/api";

type FocalPointPickerProps = {
  assetId: string;
  imageUrl: string;
  initialFocalX: number | null;
  initialFocalY: number | null;
  onSave: (focalX: number, focalY: number) => void;
  onSkip: () => void;
};

type Point = { x: number; y: number };

function clamp(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function FocalPointPicker({
  assetId,
  imageUrl,
  initialFocalX,
  initialFocalY,
  onSave,
  onSkip,
}: FocalPointPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [point, setPoint] = useState<Point>({
    x: typeof initialFocalX === "number" ? initialFocalX : 0.5,
    y: typeof initialFocalY === "number" ? initialFocalY : 0.5,
  });

  const markerStyle = useMemo(
    () => ({
      left: `${point.x * 100}%`,
      top: `${point.y * 100}%`,
    }),
    [point.x, point.y]
  );

  const updateFromClientPoint = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp((clientX - rect.left) / rect.width);
    const y = clamp((clientY - rect.top) / rect.height);
    setPoint({ x, y });
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFromClientPoint(event.clientX, event.clientY);
    },
    [updateFromClientPoint]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      updateFromClientPoint(event.clientX, event.clientY);
    },
    [updateFromClientPoint]
  );

  const stopDragging = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${assetId}/focal-point`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focalX: point.x, focalY: point.y }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ asset: unknown }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : "Не удалось сохранить точку фокуса.");
      }
      onSave(point.x, point.y);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить точку фокуса.");
    } finally {
      setBusy(false);
    }
  }, [assetId, onSave, point.x, point.y]);

  return (
    <div className="space-y-4">
      <div className="text-sm text-text-sec">
        Нажмите на главный объект фото — лицо или ключевой элемент.
      </div>

      <div
        ref={containerRef}
        className="relative h-[360px] w-full overflow-hidden rounded-2xl border border-border-subtle bg-bg-input"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
        style={{ touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        <div
          className="absolute h-4 w-4 rounded-full border-2 border-white bg-white/80 shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
          style={{
            ...markerStyle,
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>

      {error ? <div className="text-xs text-red-600">{error}</div> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy}>
          Сохранить
        </Button>
        <Button type="button" variant="secondary" onClick={onSkip} disabled={busy}>
          Пропустить
        </Button>
      </div>
    </div>
  );
}
