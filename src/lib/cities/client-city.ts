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
