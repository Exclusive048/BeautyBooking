import { describe, expect, it } from "vitest";
import * as UI_TEXT from "@/lib/ui/text";
import { pageMetadata } from "./page-metadata";

/**
 * SEO-02: метаданные страниц.
 *
 * (1) Превью ссылки несёт заголовок и описание СВОЕЙ страницы. Next сливает
 *     `metadata` поверхностно: страница без своего `openGraph` наследует
 *     корневой, и ссылка на «Тарифы» показывала описание главной.
 * (2) Тексты метаданных: в заголовке страницы нет бренда (его дописывает
 *     шаблон — иначе «Блог — МастерРядом | МастерРядом»), описание не длиннее,
 *     чем показывает поисковик, обращение — на «вы».
 *
 * @probe 2026-10-12 — в `pages.blog.title` возвращено «Блог — МастерРядом»:
 *   красный «в заголовке страницы нет бренда» (`pages.blog.title`). В
 *   `meta.description` возвращено «Найди мастера…»: красный «обращение на
 *   «вы»». Возвращено — зелёные.
 */

describe("pageMetadata", () => {
  it("превью ссылки — заголовок и описание страницы, название сайта и картинка бренда", () => {
    const metadata = pageMetadata(UI_TEXT.meta.pages.pricing, { path: "/pricing" });
    expect(metadata.title).toBe(UI_TEXT.meta.pages.pricing.title);
    expect(metadata.alternates).toEqual({ canonical: "/pricing" });
    expect(metadata.openGraph).toMatchObject({
      title: UI_TEXT.meta.pages.pricing.title,
      description: UI_TEXT.meta.pages.pricing.description,
      siteName: UI_TEXT.brand.name,
      locale: "ru_RU",
      url: "/pricing",
    });
    expect((metadata.openGraph?.images as unknown[]).length).toBe(1);
    expect(metadata.robots).toBeUndefined();
  });

  it("главная — заголовок без шаблона; заглушка — вне индекса", () => {
    expect(pageMetadata(UI_TEXT.meta, { absoluteTitle: true }).title).toEqual({ absolute: UI_TEXT.meta.title });
    expect(pageMetadata(UI_TEXT.pages.blog, { noindex: true }).robots).toEqual({ index: false, follow: true });
  });
});

type PageText = { title: string; description: string };

const PAGE_TEXTS: Array<[string, PageText]> = [
  ...Object.entries(UI_TEXT.meta.pages).map(([key, text]) => [`meta.pages.${key}`, text] as [string, PageText]),
  ["pages.blog", UI_TEXT.pages.blog],
  ["pages.giftCards", UI_TEXT.pages.giftCards],
];

describe("тексты метаданных", () => {
  it("в заголовке страницы нет бренда — его дописывает шаблон", () => {
    const withBrand = [
      ...PAGE_TEXTS.filter(([, text]) => text.title.includes(UI_TEXT.brand.name)).map(([key]) => `${key}.title`),
      ...(
        [
          ["pages.publicProfile.notFoundTitle", UI_TEXT.pages.publicProfile.notFoundTitle],
          ["pages.publicClient.title", UI_TEXT.pages.publicClient.title],
          ["pages.publicBooking.notFoundTitle", UI_TEXT.pages.publicBooking.notFoundTitle],
          ["pages.modelOffer.notFoundTitle", UI_TEXT.pages.modelOffer.notFoundTitle],
        ] as const
      )
        .filter(([, title]) => title.includes(UI_TEXT.brand.name))
        .map(([key]) => key),
    ];
    expect(withBrand).toEqual([]);
  });

  it("описание — от 30 до 160 знаков", () => {
    const all: Array<[string, string]> = [
      ["meta.description", UI_TEXT.meta.description],
      ...PAGE_TEXTS.map(([key, text]) => [`${key}.description`, text.description] as [string, string]),
    ];
    const outOfRange = all.filter(([, text]) => text.length < 30 || text.length > 160).map(([key, text]) => `${key} (${text.length})`);
    expect(outOfRange).toEqual([]);
  });

  it("обращение на «вы»", () => {
    const informal = /(^|[\s«])(Найди|Выбери|Запишись|Узнай|Открой|Попробуй)(?=[\s,.!])/u;
    const all = [UI_TEXT.meta.title, UI_TEXT.meta.description, ...PAGE_TEXTS.flatMap(([, text]) => [text.title, text.description])];
    expect(all.filter((text) => informal.test(text))).toEqual([]);
  });
});
