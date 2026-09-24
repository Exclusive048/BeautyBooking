import { describe, expect, it } from "vitest";
import { distanceMetersFrom, rankByDistance } from "./distance-ranking";

/**
 * CATALOG-SORT-DISTANCE — «По расстоянию» раньше молча отдавал релевантность.
 * Теперь — ближние первыми, без координат — в конце, равные — в базовом
 * порядке каталога.
 *
 * @probe 2026-09-24 — в компараторе `rankByDistance` ветки `null` поменяны
 * местами (кабинеты без адреса — первыми): красный «без координат — в конце».
 */
const RED_SQUARE = { latitude: 55.7539, longitude: 37.6208 };

describe("сортировка каталога по расстоянию", () => {
  it("ближние первыми", () => {
    const ranked = rankByDistance(
      [
        { id: "far", geoLat: 55.9, geoLng: 37.4 }, // ~20 км
        { id: "near", geoLat: 55.76, geoLng: 37.62 }, // ~0.7 км
        { id: "mid", geoLat: 55.8, geoLng: 37.6 }, // ~5 км
      ],
      RED_SQUARE,
    );
    expect(ranked.map((row) => row.id)).toEqual(["near", "mid", "far"]);
  });

  it("без координат — в конце, в базовом порядке", () => {
    const ranked = rankByDistance(
      [
        { id: "no-geo-1", geoLat: null, geoLng: null },
        { id: "near", geoLat: 55.76, geoLng: 37.62 },
        { id: "no-geo-2", geoLat: null, geoLng: 37.6 },
      ],
      RED_SQUARE,
    );
    expect(ranked.map((row) => row.id)).toEqual(["near", "no-geo-1", "no-geo-2"]);
  });

  it("равные расстояния сохраняют базовый порядок", () => {
    const ranked = rankByDistance(
      [
        { id: "a", geoLat: 55.76, geoLng: 37.62 },
        { id: "b", geoLat: 55.76, geoLng: 37.62 },
      ],
      RED_SQUARE,
    );
    expect(ranked.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("расстояние — в метрах, без точки или координат — null", () => {
    const meters = distanceMetersFrom(RED_SQUARE, 55.76, 37.62);
    expect(meters).toBeGreaterThan(500);
    expect(meters).toBeLessThan(1000);
    expect(distanceMetersFrom(null, 55.76, 37.62)).toBeNull();
    expect(distanceMetersFrom(RED_SQUARE, null, 37.62)).toBeNull();
  });
});
