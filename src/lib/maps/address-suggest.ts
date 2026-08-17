import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import {
  normalizeAddressQuery,
  readAddressCache,
  writeAddressCache,
} from "@/lib/maps/address-cache";

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
/**
 * RES-10 — верхняя граница запроса к Яндекс-подсказкам.
 *
 * `input.signal` тут был и раньше, но он про ОТМЕНУ вызывающим (клиент увёл
 * фокус), а не про верхнюю границу: единственный серверный вызывающий —
 * `/api/address/suggest` — сигнала не передаёт вовсе, то есть запрос был
 * неограничен. Поверхность анонимная и стоит в вводе адреса с дебаунсом,
 * поэтому зависший внешний сервис копит висящие запросы быстрее любого
 * другого пути.
 *
 * 5 с: подсказки имеют смысл, только пока пользователь ещё печатает; ответ
 * позже этого срока не нужен ни ему, ни нам.
 */
const SUGGEST_REQUEST_TIMEOUT_MS = 5_000;

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

function getSuggestKey(): string {
  const key = env.YANDEX_SUGGEST_API_KEY ?? "";
  const trimmed = key.trim();
  if (!trimmed) {
    throw new AppError("Подсказки адресов временно недоступны.", 503, "INTERNAL_ERROR");
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

  // SEC-04: тот же запрос второй раз не должен стоить платного вызова.
  const cacheParts = [normalizeAddressQuery(query), String(limit)] as const;
  const cached = await readAddressCache<AddressSuggestion[]>("suggest", cacheParts);
  if (cached) return cached;

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
      // Отмена вызывающим и верхняя граница — разные вещи, поэтому обе, а не
      // «или»: сигнал вызывающего не должен отменять таймаут, а таймаут —
      // лишать вызывающего права прервать запрос раньше.
      signal: input.signal
        ? AbortSignal.any([input.signal, AbortSignal.timeout(SUGGEST_REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(SUGGEST_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AppError("Подсказки адресов временно недоступны.", 503, "INTERNAL_ERROR");
  }

  if (!response.ok) {
    throw new AppError("Подсказки адресов временно недоступны.", 503, "INTERNAL_ERROR");
  }

  let payload: YandexSuggestResponse | null = null;
  try {
    payload = (await response.json()) as YandexSuggestResponse | null;
  } catch {
    payload = null;
  }
  if (!payload || !Array.isArray(payload.results)) {
    throw new AppError("Подсказки адресов временно недоступны.", 503, "INTERNAL_ERROR");
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

  const suggestions = Array.from(unique.values());
  await writeAddressCache("suggest", cacheParts, suggestions);
  return suggestions;
}
