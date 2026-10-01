/**
 * 29.09 доработки · 27 (RF-ONLY-SCOPE-01) — адрес в России? Чистый модуль:
 * его читают детектор города и тесты без геокодера.
 */

export type GeocodedCountry = { code: string | null; name: string | null };

const RUSSIA_CODE = "RU";
const RUSSIA_NAME = "россия";

/**
 * Адрес в России? `true` / `false` по коду страны, а без кода — по названию
 * компонента «страна»; `null`, если ответ страну не назвал вовсе (решение
 * владельца 27.2: такой адрес пропускается и пишется в лог).
 */
export function isRussianCountry(country: GeocodedCountry | undefined): boolean | null {
  if (!country) return null;
  if (country.code) return country.code.trim().toUpperCase() === RUSSIA_CODE;
  if (country.name) return country.name.trim().toLowerCase() === RUSSIA_NAME;
  return null;
}
