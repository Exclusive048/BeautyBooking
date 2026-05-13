import { pluralize } from "@/lib/utils/pluralize";

export function formatVisitsLabel(n: number): string {
  return `${n} ${pluralize(n, "визит", "визита", "визитов")}`;
}

export function formatMastersLabel(n: number): string {
  return `${n} ${pluralize(n, "мастер", "мастера", "мастеров")}`;
}

export function formatLastVisit(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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
