import { AppError } from "@/lib/api/errors";

type NominatimSuggestion = {
  display_name?: string;
};

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

export async function suggestAddresses(input: {
  query: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<string[]> {
  const query = input.query.trim();
  if (query.length < 3) return [];

  const limit = clampLimit(input.limit ?? 5);

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("accept-language", "ru");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "BeautyHub/1.0 (address-autocomplete)",
      Accept: "application/json",
    },
    cache: "no-store",
    signal: input.signal,
  });

  if (!response.ok) {
    throw new AppError("Address suggestions unavailable", 502, "INTERNAL_ERROR");
  }

  const payload = (await response.json().catch(() => null)) as NominatimSuggestion[] | null;
  if (!Array.isArray(payload)) return [];

  const unique = new Set<string>();
  for (const item of payload) {
    const value = item.display_name?.trim();
    if (value) unique.add(value);
    if (unique.size >= limit) break;
  }

  return Array.from(unique);
}
