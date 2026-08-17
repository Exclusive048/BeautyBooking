"use client";

import { QRCodeCanvas } from "qrcode.react";
import type { ComponentProps, Ref } from "react";

export type QrCodeCanvasProps = Omit<ComponentProps<typeof QRCodeCanvas>, "ref"> & {
  /**
   * Ссылка на сам `<canvas>` — обычным пропом, а не через `ref`.
   *
   * `next/dynamic` возвращает `forwardRef`-обёртку, которая вешает на
   * переданный `ref` собственный `useImperativeHandle` со своим `{ retry }`
   * (`next/dist/shared/lib/loadable.shared-runtime.js`). До обёрнутого
   * компонента `ref` не доходит вовсе, то есть `qrRef.current` молча стал бы
   * объектом лоадера вместо canvas'а — и выгрузка QR/карточки перестала бы
   * работать без единой ошибки в консоли. Отдельный проп эту ловушку обходит.
   */
  canvasRef?: Ref<HTMLCanvasElement>;
};

/**
 * Тело QR-виджета. Существует отдельным модулем, потому что `next/dynamic` —
 * это граница чанка, а не условие внутри компонента: только импорт из
 * отдельного файла уводит `qrcode.react` из бандла страницы.
 * Точка входа для потребителей — `@/components/ui/qr-code-canvas`.
 */
export default function QrCodeCanvasImpl({ canvasRef, ...props }: QrCodeCanvasProps) {
  return <QRCodeCanvas ref={canvasRef} {...props} />;
}
