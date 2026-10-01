export function formatMinutes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${value} мин`;
}
