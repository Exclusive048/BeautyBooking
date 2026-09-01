/**
 * Client-side helpers for the user's currently-selected city.
 *
 * Storage strategy:
 *   - localStorage is the primary source — survives across tabs, faster to read.
 *   - cookie mirrors the value so server components can read it via next/headers
 *     (see ./server-city.ts).
 *
 * When a user changes city we write BOTH; when reading we prefer localStorage.
 *
 * The cookie name MUST match `CITY_COOKIE_NAME` exported from ./server-city.ts.
 */

export const CITY_COOKIE_NAME = "mr-city-slug";
export const CITY_STORAGE_KEY = "mr-city-slug";

const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function readFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const pattern = new RegExp(`(?:^|; )${CITY_COOKIE_NAME}=([^;]*)`);
  const match = document.cookie.match(pattern);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function readFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getCurrentCitySlug(): string | null {
  const fromStorage = readFromStorage();
  if (fromStorage) return fromStorage;
  return readFromCookie();
}

/**
 * PWA-FIX-01 — «отложено» для первого-визитного попапа выбора города.
 *
 * 🔴 Отказ и выбор — РАЗНЫЕ факты, и хранить их одним ключом нельзя: выбранный
 * город меняет выдачу (его читает SSR через куку), отложенный попап не меняет
 * ничего, кроме того, спрашивать ли снова. Раньше второго факта не было вовсе —
 * `handleClose` не писал ничего, а решение показывать пересчитывалось в эффекте
 * по `pathname`, то есть попап возвращался на КАЖДОМ переходе и закрыть его
 * насовсем было нельзя (жалоба «постоянно выскакивает и мешает»).
 *
 * Хранится только в localStorage: серверу этот факт не нужен (попап клиентский
 * и рендерится после гидратации), а кука на каждый запрос его бы возила зря.
 * Записывается момент отказа, а не флаг — «отложено» обязано истекать, иначе
 * один случайный крестик навсегда лишает пользователя выбора города.
 */
export const CITY_PROMPT_DISMISSED_KEY = "mr-city-prompt-dismissed";

export const CITY_PROMPT_DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function isCityPromptDismissed(now: number = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(CITY_PROMPT_DISMISSED_KEY);
    if (!raw) return false;
    const at = Number.parseInt(raw, 10);
    // Испорченное значение трактуем как «не откладывали»: показать попап
    // лишний раз безопаснее, чем молча спрятать его навсегда.
    if (!Number.isFinite(at)) return false;
    return now - at < CITY_PROMPT_DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function dismissCityPrompt(now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CITY_PROMPT_DISMISSED_KEY, String(now));
  } catch {
    // localStorage может быть недоступен (приватный режим) — тогда попап
    // просто останется первым-визитным, как и был.
  }
}

export function setCurrentCitySlug(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CITY_STORAGE_KEY, slug);
  } catch {
    // localStorage may be disabled / full — cookie still works as fallback.
  }
  if (typeof document !== "undefined") {
    document.cookie = `${CITY_COOKIE_NAME}=${encodeURIComponent(slug)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  }
}
