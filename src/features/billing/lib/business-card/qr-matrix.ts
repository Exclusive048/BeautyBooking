/**
 * Матрица модулей QR-кода, считанная с уже нарисованного холста.
 *
 * Зачем: `qrcode.react` наружу отдаёт только готовые `QRCodeCanvas` /
 * `QRCodeSVG`, а кодировщик (`qrcodegen`) у него внутренний. Визитке же нужен
 * сам набор модулей — чтобы нарисовать код ровными квадратами в любом размере
 * (300 px на визитке, 1024 px в «Скачать QR») и фирменными «глазками». Масштаб
 * готовой картинки этого не даёт: 400 px → 300 px режет модули неровно и мылит
 * края, а сканер такого кода капризничает.
 *
 * Как читаем: холст рисуется без поля (`includeMargin={false}`), поэтому его
 * верхняя строка пикселей лежит в верхней строке модулей, где слева стоят
 * 7 тёмных модулей поискового узора, а за ними — светлый разделитель. Длина
 * этого тёмного отрезка = 7 модулей, отсюда число модулей; дальше — по центру
 * каждого модуля. Результат проверяется по трём поисковым узорам и
 * синхронизирующей линии; не сошлось — `null`, и вызывающий рисует холст как
 * картинку (как раньше).
 */

export type QrMatrix = readonly (readonly boolean[])[];

/** Пиксели в форме `ImageData` — без зависимости от DOM (тест подаёт свои). */
export type QrPixels = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

const FINDER_SIZE = 7;
const MIN_VERSION = 1;
const MAX_VERSION = 40;

/** Ближайший допустимый размер QR (21, 25, 29 … 177 модулей) либо `null`. */
function snapToQrSize(estimate: number): number | null {
  const version = Math.round((estimate - 17) / 4);
  if (version < MIN_VERSION || version > MAX_VERSION) return null;
  return 17 + 4 * version;
}

function hasFinder(matrix: QrMatrix, top: number, left: number): boolean {
  for (let r = 0; r < FINDER_SIZE; r += 1) {
    for (let c = 0; c < FINDER_SIZE; c += 1) {
      const ring = r === 0 || r === FINDER_SIZE - 1 || c === 0 || c === FINDER_SIZE - 1;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      if (matrix[top + r]?.[left + c] !== (ring || core)) return false;
    }
  }
  return true;
}

/** Синхронизирующая линия (строка 6 между узорами) чередуется: тёмный на чётных. */
function hasTimingRow(matrix: QrMatrix): boolean {
  const size = matrix.length;
  for (let c = FINDER_SIZE + 1; c < size - FINDER_SIZE - 1; c += 1) {
    if (matrix[6][c] !== (c % 2 === 0)) return false;
  }
  return true;
}

export function readQrMatrix(pixels: QrPixels): QrMatrix | null {
  const { width, height, data } = pixels;
  if (width !== height || width < 21) return null;

  const isDark = (x: number, y: number): boolean => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) return false;
    return data[i] + data[i + 1] + data[i + 2] < 384;
  };

  let run = 0;
  while (run < width && isDark(run, 0)) run += 1;
  if (run === 0 || run >= width) return null;

  const size = snapToQrSize((FINDER_SIZE * width) / run);
  if (size === null) return null;

  const cell = width / size;
  const matrix: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const y = Math.min(height - 1, Math.floor((row + 0.5) * cell));
    const line: boolean[] = [];
    for (let col = 0; col < size; col += 1) {
      const x = Math.min(width - 1, Math.floor((col + 0.5) * cell));
      line.push(isDark(x, y));
    }
    matrix.push(line);
  }

  const last = size - FINDER_SIZE;
  if (!hasFinder(matrix, 0, 0) || !hasFinder(matrix, 0, last) || !hasFinder(matrix, last, 0)) {
    return null;
  }
  if (!hasTimingRow(matrix)) return null;
  return matrix;
}

/** Модуль внутри одного из трёх поисковых узоров («глазков»). */
export function isFinderModule(size: number, row: number, col: number): boolean {
  const last = size - FINDER_SIZE;
  return (
    (row < FINDER_SIZE && col < FINDER_SIZE) ||
    (row < FINDER_SIZE && col >= last) ||
    (row >= last && col < FINDER_SIZE)
  );
}
