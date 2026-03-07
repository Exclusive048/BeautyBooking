import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";
import { browsStrategy } from "@/lib/visual-search/categories/brows";
import { hairstyleStrategy } from "@/lib/visual-search/categories/hairstyle";
import { lashesStrategy } from "@/lib/visual-search/categories/lashes";
import { makeupStrategy } from "@/lib/visual-search/categories/makeup";
import { manicureStrategy } from "@/lib/visual-search/categories/manicure";
import { pedicureStrategy } from "@/lib/visual-search/categories/pedicure";

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

