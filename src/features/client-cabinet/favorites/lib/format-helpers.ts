import { pluralize } from "@/lib/utils/pluralize";
import { UI_FMT, VIEWER_TZ } from "@/lib/ui/fmt";

export function formatVisitsLabel(n: number): string {
  return `${n} ${pluralize(n, "визит", "визита", "визитов")}`;
}

export function formatMastersLabel(n: number): string {
  return `${n} ${pluralize(n, "мастер", "мастера", "мастеров")}`;
}

export function formatLastVisit(iso: string): string {
  // tz-ok: viewer — дата визита без пояса салона в данных карточки избранного.
  return UI_FMT.date(iso, "dayMonthYearLong", { timeZone: VIEWER_TZ });
}

export type SortOption = "recent" | "rating" | "visits";

export function sortFavorites<
  T extends { rating: number; visitsCount: number; favoritedAt: string },
>(items: T[], sort: SortOption): T[] {
  const sorted = [...items];
  switch (sort) {
    case "rating":
      return sorted.sort((a, b) => b.rating - a.rating);
    case "visits":
      return sorted.sort((a, b) => b.visitsCount - a.visitsCount);
    case "recent":
    default:
      // API already returns favoritedAt desc; preserve that order.
      return sorted;
  }
}
