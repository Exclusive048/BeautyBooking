import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cropAreaToPixels, renderCroppedImage } from "@/lib/media/crop-render";

/**
 * CROP-PUBLIC-01 — вырез совпадает с областью, выбранной в кроппере.
 *
 * Исходник 1200×800 из четырёх цветных четвертей: какая четверть окажется в
 * вырезе, проверяется по цвету ПИКСЕЛЕЙ результата, а не по аргументам sharp.
 *
 * @probe 2026-09-23 — в `cropAreaToPixels` `top` посчитан от ширины
 *        (`area.y * imageWidth`): красный кейс «правая нижняя четверть» —
 *        кламп срезал вырез по нижнему краю, «expected 300 to be 125»
 *        (перестал быть квадратом). Возвращено — 4/4.
 */

const RED = { r: 230, g: 25, b: 75 };
const GREEN = { r: 60, g: 180, b: 75 };
const BLUE = { r: 67, g: 99, b: 216 };
const YELLOW = { r: 255, g: 225, b: 25 };

async function quadrants(): Promise<Buffer> {
  const w = 1200;
  const h = 800;
  const tile = (color: typeof RED) =>
    sharp({ create: { width: w / 2, height: h / 2, channels: 3, background: color } }).png().toBuffer();
  const [tl, tr, bl, br] = await Promise.all([tile(RED), tile(GREEN), tile(BLUE), tile(YELLOW)]);
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      { input: tl, left: 0, top: 0 },
      { input: tr, left: w / 2, top: 0 },
      { input: bl, left: 0, top: h / 2 },
      { input: br, left: w / 2, top: h / 2 },
    ])
    .png()
    .toBuffer();
}

async function centerColor(buffer: Buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, width: info.width, height: info.height };
}

function near(actual: { r: number; g: number; b: number }, expected: typeof RED) {
  expect(Math.abs(actual.r - expected.r)).toBeLessThan(12);
  expect(Math.abs(actual.g - expected.g)).toBeLessThan(12);
  expect(Math.abs(actual.b - expected.b)).toBeLessThan(12);
}

describe("renderCroppedImage", () => {
  it("правая нижняя четверть — жёлтая, квадрат", async () => {
    // Квадрат 300×300 px внутри правой нижней четверти (x 700–1000, y 450–750).
    const out = await renderCroppedImage(await quadrants(), { x: 700 / 1200, y: 450 / 800, width: 300 / 1200, height: 300 / 800 });
    const c = await centerColor(out);
    near(c, YELLOW);
    expect(c.width).toBe(c.height);
  });

  it("левая верхняя четверть — красная", async () => {
    const out = await renderCroppedImage(await quadrants(), { x: 0.05, y: 0.05, width: 0.3, height: 0.3 });
    near(await centerColor(out), RED);
  });

  it("сторона ограничена потолком и не увеличивается сверх исходника", async () => {
    const big = await renderCroppedImage(await quadrants(), { x: 0, y: 0, width: 1, height: 1 }, 400);
    const meta = await sharp(big).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(400);

    const small = await renderCroppedImage(await quadrants(), { x: 0, y: 0, width: 0.1, height: 0.15 }, 640);
    const smallMeta = await sharp(small).metadata();
    expect(smallMeta.width).toBe(120); // 0.1 × 1200 — не растянуто до 640
  });
});

describe("cropAreaToPixels", () => {
  it("округление не выводит прямоугольник за край", () => {
    const px = cropAreaToPixels({ x: 0.9999, y: 0.9999, width: 0.5, height: 0.5 }, 1200, 800);
    expect(px.left + px.width).toBeLessThanOrEqual(1200);
    expect(px.top + px.height).toBeLessThanOrEqual(800);
    expect(px.width).toBeGreaterThanOrEqual(1);
  });
});
