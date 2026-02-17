import { AppError } from "@/lib/api/errors";

export type AddressSuggestion = {
  value: string;
};

type YandexSuggestResponse = {
  results?: YandexSuggestItem[];
};

type YandexSuggestItem = {
  title?: { text?: string };
  subtitle?: { text?: string };
  address?: { formatted_address?: string };
};

const YANDEX_SUGGEST_URL = "https://suggest-maps.yandex.ru/v1/suggest";

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

function getSuggestKey(): string {
  const key = process.env.YANDEX_SUGGEST_API_KEY ?? "";
  const trimmed = key.trim();
  if (!trimmed) {
    throw new AppError("Address suggestions unavailable", 503, "INTERNAL_ERROR");
  }
  return trimmed;
}

function extractValue(item: YandexSuggestItem): string {
  const formatted = item.address?.formatted_address?.trim();
  if (formatted) return formatted;
  const title = item.title?.text?.trim();
  const subtitle = item.subtitle?.text?.trim();
  if (title && subtitle && !title.includes(subtitle)) {
    return `${title}, ${subtitle}`;
  }
  return title ?? subtitle ?? "";
}

export async function suggestAddresses(input: {
  query: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<AddressSuggestion[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const limit = clampLimit(input.limit ?? 5);
  const apiKey = getSuggestKey();

  const url = new URL(YANDEX_SUGGEST_URL);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("text", query);
  url.searchParams.set("lang", "ru_RU");
  url.searchParams.set("results", String(limit));
  url.searchParams.set("types", "geo");
  url.searchParams.set("print_address", "1");

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: input.signal,
    });
  } catch {
    throw new AppError("Address suggestions unavailable", 503, "INTERNAL_ERROR");
  }

  if (!response.ok) {
    throw new AppError("Address suggestions unavailable", 503, "INTERNAL_ERROR");
  }

  let payload: YandexSuggestResponse | null = null;
  try {
    payload = (await response.json()) as YandexSuggestResponse | null;
  } catch {
    payload = null;
  }
  if (!payload || !Array.isArray(payload.results)) {
    throw new AppError("Address suggestions unavailable", 503, "INTERNAL_ERROR");
  }

  const unique = new Map<string, AddressSuggestion>();
  for (const item of payload.results) {
    const value = extractValue(item);
    if (!value) continue;
    if (!unique.has(value)) {
      unique.set(value, { value });
    }
    if (unique.size >= limit) break;
  }

  return Array.from(unique.values());
}
