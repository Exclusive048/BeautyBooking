import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";
import { manicureStrategy } from "@/lib/visual-search/categories/manicure";
import { pedicureStrategy } from "@/lib/visual-search/categories/pedicure";
import { lashesStrategy } from "@/lib/visual-search/categories/lashes";
import { browsStrategy } from "@/lib/visual-search/categories/brows";
import { makeupStrategy } from "@/lib/visual-search/categories/makeup";
import { hairstyleStrategy } from "@/lib/visual-search/categories/hairstyle";

const registry = new Map<string, VisualSearchStrategy>([
  ["manicure", manicureStrategy],
  ["pedicure", pedicureStrategy],
  ["lashes", lashesStrategy],
  ["brows", browsStrategy],
  ["makeup", makeupStrategy],
  ["hairstyle", hairstyleStrategy],
]);

export function getStrategy(slug: string): VisualSearchStrategy | null {
  return registry.get(slug) ?? null;
}

export function getSupportedSlugs(): string[] {
  return Array.from(registry.keys());
}
