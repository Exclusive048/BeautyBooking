const NUMBER_FMT = new Intl.NumberFormat("ru-RU");

export function formatRubles(kopeks: number): string {
  if (!Number.isFinite(kopeks) || kopeks <= 0) return "—";
  return `${NUMBER_FMT.format(Math.round(kopeks / 100))} ₽`;
}

export function formatMinutes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${value} мин`;
}
