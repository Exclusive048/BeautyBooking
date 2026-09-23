import { describe, expect, it } from "vitest";
import { cropAreaImageStyle, toCropArea, type CropArea } from "@/lib/media/crop-geometry";

/**
 * CROP-PREVIEW-01 — миниатюра показывает ровно ту область, что была в кружке.
 *
 * Проверяется не форма стиля, а СВОЙСТВО результата: какой отрезок исходника
 * (в долях) окажется видимым в боксе. Стиль переводится в видимое окно так,
 * как его разложит браузер: проценты `left`/`width` абсолютного элемента —
 * от ширины бокса, `top`/`height` — от высоты.
 *
 * @probe 2026-09-23 — в `cropAreaImageStyle` подставлен сдвиг прежнего превью
 *        кроппера: `translate(-(x·scale)%)` считался от САМОЙ картинки, то есть
 *        в долях бокса это `left = -(x / width / width)`. Красные три кейса
 *        из четырёх, в т.ч. «увеличение ×2, смещение»: «expected 0.5 to be
 *        close to 0.25» — окно начиналось вдвое дальше. Возвращено — 7/7.
 */

function pct(value: string | number | undefined): number {
  return Number.parseFloat(String(value)) / 100;
}

/** Какая доля исходника видна в боксе 1×1 (единицы бокса). */
function visibleWindow(area: CropArea) {
  const style = cropAreaImageStyle(area);
  const imgWidth = pct(style.width); // в ширинах бокса
  const imgHeight = pct(style.height);
  const left = pct(style.left);
  const top = pct(style.top);
  return {
    x0: (0 - left) / imgWidth,
    x1: (1 - left) / imgWidth,
    y0: (0 - top) / imgHeight,
    y1: (1 - top) / imgHeight,
  };
}

describe("cropAreaImageStyle", () => {
  const cases: Array<[string, CropArea]> = [
    ["без обрезки", { x: 0, y: 0, width: 1, height: 1 }],
    ["увеличение ×2, смещение", { x: 0.25, y: 0.4, width: 0.5, height: 0.5 }],
    // Квадрат на фото 3:2: по ширине область меньше, чем по высоте.
    ["квадрат на горизонтальном фото", { x: 0.3, y: 0.1, width: 0.4, height: 0.6 }],
    ["у правого нижнего края", { x: 0.7, y: 0.75, width: 0.3, height: 0.25 }],
  ];

  it.each(cases)("%s — видна ровно выбранная область", (_name, area) => {
    const win = visibleWindow(area);
    expect(win.x0).toBeCloseTo(area.x, 6);
    expect(win.x1).toBeCloseTo(area.x + area.width, 6);
    expect(win.y0).toBeCloseTo(area.y, 6);
    expect(win.y1).toBeCloseTo(area.y + area.height, 6);
  });

  it("снимает ограничения размера, которые бы сжали растянутую картинку", () => {
    const style = cropAreaImageStyle({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 });
    expect(style.maxWidth).toBe("none");
    expect(style.maxHeight).toBe("none");
    expect(style.position).toBe("absolute");
  });
});

describe("toCropArea", () => {
  it("неполная или вырожденная область — null", () => {
    expect(toCropArea(0.1, 0.1, null, 0.5)).toBeNull();
    expect(toCropArea(0.1, 0.1, 0, 0.5)).toBeNull();
    expect(toCropArea(undefined, 0.1, 0.5, 0.5)).toBeNull();
  });

  it("полная область — как есть", () => {
    expect(toCropArea(0.1, 0.2, 0.3, 0.4)).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });
});
