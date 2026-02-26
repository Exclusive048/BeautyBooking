export interface VisualSearchStrategy {
  categorySlug: string;
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
