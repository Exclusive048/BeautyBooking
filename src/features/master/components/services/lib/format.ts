import { UI_TEXT } from "@/lib/ui/text";

const NUMBER_FMT = new Intl.NumberFormat("ru-RU");
const T = UI_TEXT.cabinetMaster.servicesPage.durationFormat;

export function formatRubles(kopeks: number): string {
  if (!Number.isFinite(kopeks) || kopeks <= 0) return "—";
  return `${NUMBER_FMT.format(Math.round(kopeks / 100))} ₽`;
}

/** "60 мин" / "1 ч 30 мин" / "2 ч". */
export function formatDuration(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "—";
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  if (hours === 0) return `${minutes} ${T.minutesShort}`;
  if (minutes === 0) return `${hours} ${T.hoursShort}`;
  return `${hours} ${T.hoursShort} ${minutes} ${T.minutesShort}`;
}
