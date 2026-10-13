import type { Metadata } from "next";
import { versionedBrandUrl } from "@/lib/pwa/brand-asset-version";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * SEO-02: метаданные страницы одним вызовом — заголовок, описание, канон и
 * превью ссылки.
 *
 * Next сливает `metadata` родителя и страницы ПОВЕРХНОСТНО: `openGraph`
 * страницы целиком заменяет корневой, а страница без своего `openGraph`
 * наследует корневой — с заголовком и описанием ГЛАВНОЙ. Так и было: ссылка на
 * «Тарифы», каталог или «О компании» в VK и Telegram показывала заголовок и
 * описание главной. Поэтому превью собирается здесь — из общей базы сайта и
 * своих заголовка и описания страницы.
 */

/** Заголовок вкладки и выдачи: « | МастерРядом» после заголовка страницы. */
export const SITE_TITLE_TEMPLATE = `%s | ${UI_TEXT.brand.name}`;

/** Картинка бренда для превью ссылок — у страниц без своей картинки. */
export const BRAND_OG_IMAGE = {
  url: versionedBrandUrl("/brand/og-mark.png"),
  width: 1200,
  height: 1200,
  alt: UI_TEXT.brand.name,
} as const;

/** Общее у превью всех страниц сайта. */
export const SITE_OPEN_GRAPH = {
  type: "website",
  locale: "ru_RU",
  siteName: UI_TEXT.brand.name,
} as const;

type PageText = { readonly title: string; readonly description: string };

type PageMetadataOptions = {
  /** Канонический путь страницы (`/catalog`). */
  path?: string;
  /** Страница-заглушка: в индекс не идёт, ссылки с неё учитываются. */
  noindex?: boolean;
  /** Заголовок целиком, без « | МастерРядом» — бренд уже в нём (главная). */
  absoluteTitle?: boolean;
};

export function pageMetadata(text: PageText, options: PageMetadataOptions = {}): Metadata {
  const { title, description } = text;
  return {
    title: options.absoluteTitle ? { absolute: title } : title,
    description,
    ...(options.path ? { alternates: { canonical: options.path } } : {}),
    openGraph: {
      ...SITE_OPEN_GRAPH,
      title,
      description,
      ...(options.path ? { url: options.path } : {}),
      images: [{ ...BRAND_OG_IMAGE }],
    },
    // Картинку Next берёт из `openGraph`, когда у `twitter` своей нет.
    twitter: { card: "summary_large_image", title, description },
    ...(options.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
