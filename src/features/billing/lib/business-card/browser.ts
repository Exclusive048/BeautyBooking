import { readQrMatrix, type QrMatrix } from "./qr-matrix";

/**
 * Браузерная обвязка визитки: гарнитура, фото, QR, файл и «Поделиться».
 * Рисование — в `render.ts`; здесь всё, что ждёт сеть или спрашивает браузер.
 */

const FONT_TIMEOUT_MS = 3000;
const QR_WAIT_MS = 4000;
const QR_POLL_MS = 50;

/**
 * Гарнитура бренда для `ctx.font`. `next/font` кладёт настоящее имя семейства
 * (с хешем и метрической заглушкой) в `--font-display` на `<html>`; литерал
 * «Playfair Display» на холсте не сработал бы — такого семейства на странице нет.
 */
export function resolveCardFontFamily(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
  return value ? `${value}, Georgia, serif` : "Georgia, serif";
}

/**
 * Холст не ждёт шрифт: начертание, которое ещё не скачано, молча рисуется
 * запасным. Поэтому все нужные начертания (обе письменности) грузятся явно, но
 * не дольше 3 с — визитка запасным шрифтом лучше, чем никакой.
 */
export async function ensureCardFonts(family: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const sample = "АаЯяAa0";
  const faces = ["400", "600", "italic 400"].map((face) => `${face} 40px ${family}`);
  await Promise.race([
    Promise.allSettled(faces.map((face) => document.fonts.load(face, sample))),
    new Promise((resolve) => window.setTimeout(resolve, FONT_TIMEOUT_MS)),
  ]);
}

/**
 * Фото для холста. `crossOrigin` обязателен: без CORS-заголовков чужое фото
 * «испачкало» бы холст, и `toBlob` бросил бы `SecurityError`. Не загрузилось —
 * `null`, визитка рисует инициалы.
 */
export function loadCardImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Матрица с холста `QrCodeCanvas`; не прочиталась — сам холст (рисуется картинкой).
 * Пиксели читаются с копии: контекст холста библиотеки создан без
 * `willReadFrequently`, и повторные `getImageData` на нём (опрос `waitForQr`)
 * браузер отмечает предупреждением о медленном чтении.
 */
export function readQrFromCanvas(canvas: HTMLCanvasElement | null): QrMatrix | HTMLCanvasElement | null {
  if (!canvas || canvas.width === 0) return null;
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  try {
    ctx.drawImage(canvas, 0, 0);
    return readQrMatrix(ctx.getImageData(0, 0, copy.width, copy.height)) ?? canvas;
  } catch {
    return canvas;
  }
}

/**
 * `QrCodeCanvas` приезжает отдельным чанком (PERF-17) и рисует из эффекта,
 * поэтому к первому кадру холста может не быть. Ждём, пока на нём появится
 * читаемый код; по таймауту отдаём то, что есть.
 */
export async function waitForQr(
  getCanvas: () => HTMLCanvasElement | null,
  isCancelled: () => boolean,
): Promise<QrMatrix | HTMLCanvasElement> {
  const started = Date.now();
  for (;;) {
    const canvas = getCanvas();
    const qr = readQrFromCanvas(canvas);
    if (qr && qr !== canvas) return qr;
    if (Date.now() - started > QR_WAIT_MS || isCancelled()) {
      if (canvas) return canvas;
      throw new Error("qr canvas is not ready");
    }
    await new Promise((resolve) => window.setTimeout(resolve, QR_POLL_MS));
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas.toBlob returned null"));
    }, "image/png");
  });
}

/**
 * Скачивание по готовой ссылке на blob — синхронно в обработчике нажатия:
 * Safari на iOS не пускает скачивание после `await`.
 */
export function downloadFromUrl(href: string, filename: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export type ShareOutcome = "shared-file" | "shared-link" | "cancelled" | "unsupported";

/**
 * «Поделиться»: картинкой, где браузер умеет делиться файлами (телефоны,
 * Windows/ChromeOS), иначе — ссылкой через системное меню. Ни того ни другого —
 * `unsupported`, вызывающий копирует ссылку.
 *
 * Вызывать без `await` перед собой: `navigator.share` требует жеста
 * пользователя, а Safari теряет его на первом же ожидании. Поэтому картинка
 * готовится заранее, а здесь только собирается `File`.
 */
export async function shareCardImage(input: {
  blob: Blob;
  filename: string;
  title: string;
  url: string;
}): Promise<ShareOutcome> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return "unsupported";
  const file = new File([input.blob], input.filename, { type: input.blob.type || "image/png" });
  const fileData: ShareData = { files: [file], title: input.title, text: input.url };
  const linkData: ShareData = { title: input.title, url: input.url };
  const canShareFile = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  try {
    if (canShareFile) {
      await navigator.share(fileData);
      return "shared-file";
    }
    await navigator.share(linkData);
    return "shared-link";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    return "unsupported";
  }
}
