import "server-only";
import { cache } from "react";
import { del, get, set } from "@/lib/cache/cache";
import { logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { resolveSiteSeo, type SiteSeoText, type StoredSiteSeo } from "@/lib/seo/site-seo-shared";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * SEO-ADMIN-01: заголовок и описание главной из раздела «SEO главной страницы»
 * в `/admin/settings`. До этого настройки сохранялись, но сайт их не читал.
 *
 * Меняют: заголовок и описание главной, превью ссылки на неё и описание сайта в
 * разметке (`WebSite.description` в корневом layout). Не меняют: заголовки
 * остальных страниц и страниц мастеров — у каждой свои.
 *
 * Разметку рисует корневой layout на КАЖДОЙ странице, поэтому чтение идёт через
 * общий кэш (Redis: сохранение в контейнере `api` обязано сбросить его и для
 * `web`) и `cache()` React — layout и `generateMetadata` главной в одном
 * запросе читают один раз.
 */

export const SITE_SEO_KEYS = {
  title: "siteSeoTitle",
  description: "siteSeoDescription",
} as const;

const CACHE_KEY = "seo:site:v1";
// Сохранение сбрасывает кэш сразу; срок — граница на случай, если сброс не
// дошёл (Redis не ответил).
const CACHE_TTL_SECONDS = 300;

export const SITE_SEO_DEFAULTS: SiteSeoText = {
  title: UI_TEXT.meta.title,
  description: UI_TEXT.meta.description,
};

/** Сохранённое в настройках, без кэша — для формы админки. */
export async function readStoredSiteSeo(): Promise<StoredSiteSeo> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [SITE_SEO_KEYS.title, SITE_SEO_KEYS.description] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return {
    title: byKey.get(SITE_SEO_KEYS.title) ?? null,
    description: byKey.get(SITE_SEO_KEYS.description) ?? null,
  };
}

async function readStoredSiteSeoCached(): Promise<StoredSiteSeo> {
  // Объект, а не строки: «настройки пусты» ({ null, null }) — тоже ответ,
  // а `null` из кэша — промах.
  const cached = await get<StoredSiteSeo>(CACHE_KEY);
  if (cached) return cached;
  const stored = await readStoredSiteSeo();
  await set(CACHE_KEY, stored, CACHE_TTL_SECONDS);
  return stored;
}

/**
 * Заголовок и описание главной для сайта. Сбой чтения не роняет страницу:
 * остаётся текст из кода.
 */
export const getSiteSeo = cache(async (): Promise<SiteSeoText> => {
  try {
    return resolveSiteSeo(await readStoredSiteSeoCached(), SITE_SEO_DEFAULTS);
  } catch (error) {
    logError("seo.site.read_failed", { error: String(error) });
    return SITE_SEO_DEFAULTS;
  }
});

/** После сохранения в админке. Сбой сброса не отменяет сохранение. */
export async function invalidateSiteSeoCache(): Promise<void> {
  try {
    await del(CACHE_KEY);
  } catch (error) {
    logError("seo.site.cache_invalidate_failed", { error: String(error) });
  }
}
