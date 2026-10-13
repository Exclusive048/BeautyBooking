import type { SeoSectionData } from "@/features/admin-cabinet/settings/types";
import { SITE_SEO_DEFAULTS, readStoredSiteSeo } from "@/lib/seo/site-seo";

export async function getSeoSectionData(): Promise<SeoSectionData> {
  const stored = await readStoredSiteSeo();
  return {
    values: {
      seoTitle: stored.title ?? "",
      seoDescription: stored.description ?? "",
    },
    // Текст из кода — подсказкой в пустом поле: видно, что будет на сайте.
    defaults: {
      seoTitle: SITE_SEO_DEFAULTS.title,
      seoDescription: SITE_SEO_DEFAULTS.description,
    },
  };
}
