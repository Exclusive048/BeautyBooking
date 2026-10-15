import { describe, expect, it } from "vitest";
import { isFinderModule, readQrMatrix, type QrMatrix, type QrPixels } from "./qr-matrix";

/**
 * Визитка рисует QR ровными модулями из матрицы, прочитанной с холста
 * `QrCodeCanvas`. Ошибка чтения не падает громко — визитка просто получила бы
 * другой (несканируемый) код, — поэтому чтение проверяется на растре той же
 * формы, что рисует `qrcode.react`: без поля, сторона не кратна числу модулей.
 *
 * @probe 2026-10-15 — число модулей считалось без привязки к 21+4k
 *        (`Math.round(7 * width / run)`): на «чистом» растре все случаи
 *        остались зелёными (минимальная проба вакуумна), поэтому добавлен
 *        растр с растянутыми сглаживанием краями — на нём красные оба случая
 *        «…когда сглаживание растянуло края» (у 190 px отрезок «глазка»
 *        33 px → 40 модулей вместо 41). Убрана проверка синхро-линии: красный «отвергает растр,
 *        где совпали только глазки». Возвращено — зелёный.
 */

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** Структурно правдоподобный QR: три «глазка» с разделителями, синхро-линии, данные. */
function makeMatrix(size: number, seed = 7): boolean[][] {
  const random = seededRandom(seed);
  const matrix = Array.from({ length: size }, () => Array.from({ length: size }, () => random() < 0.5));
  const placeFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const row = top + r;
        const col = left + c;
        if (row < 0 || col < 0 || row >= size || col >= size) continue;
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[row][col] = inside && (ring || core);
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);
  for (let i = 8; i < size - 8; i += 1) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }
  return matrix;
}

/**
 * Растр как у `QRCodeCanvas` без поля: модуль = доля стороны, тёмный — чёрный.
 * `bleed` — пиксель тёмный, если тёмный модуль задевает его хоть краем: так
 * сглаживание холста растягивает отрезок «глазка» на пиксель.
 */
function rasterize(matrix: QrMatrix, width: number, bleed = false): QrPixels {
  const size = matrix.length;
  const data = new Uint8ClampedArray(width * width * 4);
  const modulesOf = (pixel: number): number[] => {
    const first = Math.floor((pixel * size) / width);
    if (!bleed) return [first];
    const last = Math.min(size - 1, Math.ceil(((pixel + 1) * size) / width) - 1);
    return last > first ? [first, last] : [first];
  };
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dark = modulesOf(y).some((row) => modulesOf(x).some((col) => matrix[row][col]));
      const i = (y * width + x) * 4;
      const value = dark ? 0 : 255;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { width, height: width, data };
}

describe("readQrMatrix", () => {
  it.each([
    [29, 512],
    [33, 512],
    [33, 400],
    [37, 800],
    [25, 180],
  ])("читает матрицу %i модулей при стороне %i", (size, width) => {
    const matrix = makeMatrix(size, size + width);
    expect(readQrMatrix(rasterize(matrix, width))).toEqual(matrix);
  });

  it.each([
    [33, 180],
    [41, 190],
  ])("читает матрицу %i модулей при стороне %i, когда сглаживание растянуло края", (size, width) => {
    const matrix = makeMatrix(size, size * width);
    expect(readQrMatrix(rasterize(matrix, width, true))).toEqual(matrix);
  });

  it("возвращает null для пустого холста", () => {
    const width = 512;
    const data = new Uint8ClampedArray(width * width * 4);
    expect(readQrMatrix({ width, height: width, data })).toBeNull();
  });

  it("возвращает null для неквадратного холста", () => {
    expect(readQrMatrix({ width: 400, height: 300, data: new Uint8ClampedArray(400 * 300 * 4) })).toBeNull();
  });

  it("отвергает растр, где совпали только глазки", () => {
    const matrix = makeMatrix(33);
    // Синхро-линия сломана: два тёмных модуля подряд.
    matrix[6][10] = true;
    matrix[6][11] = true;
    expect(readQrMatrix(rasterize(matrix, 512))).toBeNull();
  });

  it("отвергает растр, где нет третьего глазка", () => {
    const matrix = makeMatrix(33);
    for (let r = 26; r < 33; r += 1) for (let c = 0; c < 7; c += 1) matrix[r][c] = false;
    expect(readQrMatrix(rasterize(matrix, 512))).toBeNull();
  });
});

describe("isFinderModule", () => {
  it("отмечает ровно три области 7×7", () => {
    const size = 29;
    let count = 0;
    for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (isFinderModule(size, r, c)) count += 1;
    expect(count).toBe(3 * 49);
    expect(isFinderModule(size, 0, 0)).toBe(true);
    expect(isFinderModule(size, 0, 28)).toBe(true);
    expect(isFinderModule(size, 28, 0)).toBe(true);
    expect(isFinderModule(size, 28, 28)).toBe(false);
    expect(isFinderModule(size, 7, 7)).toBe(false);
  });
});
