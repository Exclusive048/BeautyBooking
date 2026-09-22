import type { VisualCategorySlug } from "@/lib/visual-search/prompt";

export type VisualSearchProviderResult = {
  provider: {
    id: string;
    name: string;
    publicUsername: string | null;
    avatarUrl: string | null;
    ratingAvg: number;
  };
  matchingPhotos: Array<{ assetId: string; url: string; similarity: number }>;
  score: number;
  category: VisualCategorySlug;
};

/**
 * `unavailable` (VISUAL-SEARCH-TRANSIENT-01) — отказал провайдер (сеть, таймаут,
 * 429/5xx), а не «на фото ничего нет». Отдельная причина нужна по двум поводам:
 * клиенту честнее «попробуйте ещё раз», чем «не поняли, что на фото», а роут
 * такой ответ не кэширует — иначе один сбой держался бы на этом фото сутки.
 */
export type VisualSearchFailureReason =
  | "unrecognized"
  | "not_enough_indexed"
  | "low_confidence"
  | "unavailable";

export type VisualSearchResponse =
  | { ok: true; results: VisualSearchProviderResult[]; category: VisualCategorySlug }
  | { ok: false; reason: VisualSearchFailureReason };

export type VisualSearchHttpResponse = VisualSearchResponse & { message?: string };

