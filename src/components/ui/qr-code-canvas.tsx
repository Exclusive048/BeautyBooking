"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";
import type { QrCodeCanvasProps } from "@/components/ui/qr-code-canvas-impl";

const DEFAULT_QR_SIZE = 128;

/**
 * PERF-17 — `qrcode.react` (собранный чанк 21 kB) статическим импортом ехал
 * двум страницам настроек целиком, хотя обе показывают QR только после
 * ответа API (`loading` → `null` → разметка), то есть в первый кадр он не
 * попадал никогда.
 *
 * `ssr: false` ничего не меняет по смыслу: `QRCodeCanvas` рисует в canvas из
 * эффекта, поэтому в серверной разметке и раньше был пустой холст.
 */
const QrCodeCanvasImpl = dynamic(() => import("@/components/ui/qr-code-canvas-impl"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/**
 * QR-код профиля. Коробка фиксированного размера вокруг холста — чтобы
 * приехавший чанк не двигал соседей: скелет занимает ровно ту площадь,
 * которую займёт canvas.
 */
export function QrCodeCanvas(props: QrCodeCanvasProps) {
  const box = props.size ?? DEFAULT_QR_SIZE;
  return (
    <div style={{ width: box, height: box }}>
      <QrCodeCanvasImpl {...props} />
    </div>
  );
}
