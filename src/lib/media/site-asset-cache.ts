import { del, get, set } from "@/lib/cache/cache";
import { SITE_LOGIN_HERO_SETTING_KEY, SITE_LOGO_SETTING_KEY } from "@/lib/media/settings";

/**
 * Кэш картинок сайта — логотип в шапке и фото экрана входа (29.09 доработки ·
 * 20, PERF-01 вариант C). Шапка стоит на каждой странице и на каждом просмотре
 * делала 2 запроса к БД (настройка + актив) ради одной ссылки, которая меняется
 * раз в месяцы.
 *
 * Сброс — из `lib/media/service.ts` на каждом пути, меняющем ответ: загрузка
 * (новая настройка), удаление, мягкое удаление актива, новая область обрезки
 * (ссылка логотипа несёт версию области). TTL — страховка на правку в обход
 * сервиса (руками в БД). Кэш общий для контейнеров `web` и `api` (Redis), так
 * что смена логотипа в админке видна сразу на всех.
 */
export const SITE_ASSET_CACHE_TTL_SECONDS = 300;

export type CachedSiteAsset = { url: string } | null;

export function siteAssetCacheKey(settingKey: string): string {
  return `media:site-asset:${settingKey}`;
}

/**
 * Значение обёрнуто в объект: `null` внутри — это ответ «картинки нет», а
 * `null` из `get` — промах (иначе сайт без логотипа ходил бы в БД каждый раз).
 */
export async function readSiteAssetCache(settingKey: string): Promise<{ asset: CachedSiteAsset } | null> {
  const cached = await get<{ asset: CachedSiteAsset }>(siteAssetCacheKey(settingKey));
  return cached && typeof cached === "object" && "asset" in cached ? cached : null;
}

export async function writeSiteAssetCache(settingKey: string, asset: CachedSiteAsset): Promise<void> {
  await set(siteAssetCacheKey(settingKey), { asset }, SITE_ASSET_CACHE_TTL_SECONDS);
}

export async function invalidateSiteAssetCache(): Promise<void> {
  await Promise.all([
    del(siteAssetCacheKey(SITE_LOGO_SETTING_KEY)),
    del(siteAssetCacheKey(SITE_LOGIN_HERO_SETTING_KEY)),
  ]);
}
