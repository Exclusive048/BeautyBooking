import { haversineKm } from "@/lib/geo/haversine";

export type GeoPoint = { latitude: number; longitude: number };

/** Расстояние в метрах до кабинета; `null` — у кабинета нет координат (или нет точки). */
export function distanceMetersFrom(
  origin: GeoPoint | null,
  lat: number | null,
  lng: number | null,
): number | null {
  if (!origin || lat === null || lng === null) return null;
  return Math.round(haversineKm(origin, { latitude: lat, longitude: lng }) * 1000);
}

/**
 * CATALOG-SORT-DISTANCE — порядок «По расстоянию». Строки приходят уже в
 * базовом порядке каталога; сортировка стабильная, поэтому равные расстояния
 * сохраняют его. Кабинеты без координат — в конце (расстояния у них нет,
 * прятать их из выдачи нельзя).
 */
export function rankByDistance<T extends { id: string; geoLat: number | null; geoLng: number | null }>(
  rows: readonly T[],
  origin: GeoPoint,
): Array<{ id: string; distance: number | null }> {
  return rows
    .map((row, index) => ({ id: row.id, index, distance: distanceMetersFrom(origin, row.geoLat, row.geoLng) }))
    .sort((left, right) => {
      if (left.distance === null && right.distance === null) return left.index - right.index;
      if (left.distance === null) return 1;
      if (right.distance === null) return -1;
      return left.distance - right.distance || left.index - right.index;
    })
    .map(({ id, distance }) => ({ id, distance }));
}
