import { snapServiceDurationMin } from "@/lib/services/service-duration";

export function roundToNearestStep(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor((value + step / 2) / step) * step;
}

/**
 * SERVICE-DURATION-GRID: длительность услуги студии — на общей сетке
 * (`lib/services/service-duration.ts`), как у мастера. Было — кратно 5 минутам.
 */
export function normalizeStudioServiceDurationMin(value: number): number {
  return snapServiceDurationMin(value);
}

export function normalizeStudioServicePrice(value: number): number {
  return Math.max(0, roundToNearestStep(value, 100));
}
