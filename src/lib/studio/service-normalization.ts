export function roundToNearestStep(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor((value + step / 2) / step) * step;
}

export function normalizeStudioServiceDurationMin(value: number): number {
  return Math.max(5, roundToNearestStep(value, 5));
}

export function normalizeStudioServicePrice(value: number): number {
  return Math.max(0, roundToNearestStep(value, 100));
}
