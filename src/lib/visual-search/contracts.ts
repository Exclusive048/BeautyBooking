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

export type VisualSearchFailureReason = "unrecognized" | "not_enough_indexed" | "low_confidence";

export type VisualSearchResponse =
  | { ok: true; results: VisualSearchProviderResult[]; category: VisualCategorySlug }
  | { ok: false; reason: VisualSearchFailureReason };

export type VisualSearchHttpResponse = VisualSearchResponse & { message?: string };

