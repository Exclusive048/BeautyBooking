export const VISUAL_CATEGORY_SLUGS = [
  "manicure",
  "pedicure",
  "lashes",
  "brows",
  "makeup",
  "hairstyle",
] as const;

export type VisualCategorySlug = (typeof VISUAL_CATEGORY_SLUGS)[number];

export const VISUAL_CATEGORY_LABELS: Record<VisualCategorySlug, string> = {
  manicure: "Маникюр",
  pedicure: "Педикюр",
  lashes: "Ресницы",
  brows: "Брови",
  makeup: "Макияж",
  hairstyle: "Причёски",
};

export type VisualCategoryOrNone = VisualCategorySlug | "none";
export type VisualConfidence = "high" | "medium" | "low";

export type ClassificationResult = {
  category: VisualCategoryOrNone;
  confidence: VisualConfidence;
};

export interface VisualSearchStrategy {
  categorySlug: VisualCategorySlug;
  promptVersion: string;
  systemPrompt: string;
  userPrompt: string;
  filterFields: string[];
}

export interface VisualSearchResult {
  text_description: string;
  meta: Record<string, unknown>;
  error?: "not_applicable";
}

export function isVisualCategorySlug(value: string): value is VisualCategorySlug {
  return (VISUAL_CATEGORY_SLUGS as readonly string[]).includes(value);
}

