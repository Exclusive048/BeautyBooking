import { UI_TEXT } from "@/lib/ui/text";

export const UI_FMT = {
  inviteTitle(studioName: string): string {
    return `Приглашение от ${studioName}`;
  },
  notificationTimeLabel(iso: string): string {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  },
  ratingLabel(rating: number, count: number): string {
    if (count <= 0) return UI_TEXT.publicProfile.hero.novice;
    return `⭐ ${rating.toFixed(1)} (${count})`;
  },
  totalLabel(sum: number): string {
    return `Итого: ${new Intl.NumberFormat("ru-RU").format(sum)} ₽`;
  },
  durationLabel(minutes: number): string {
    if (minutes <= 0) return "0 мин";
    if (minutes % 60 === 0) return `${minutes / 60} ч`;
    return `${minutes} мин`;
  },
  priceLabel(price: number): string {
    return `${new Intl.NumberFormat("ru-RU").format(price)} ₽`;
  },
  priceDurationLabel(price: number, minutes: number): string {
    return `${UI_FMT.priceLabel(price)} • ${UI_FMT.durationLabel(minutes)}`;
  },
} as const;
