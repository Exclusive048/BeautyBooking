/**
 * City name and slug helpers.
 *
 * Used by detect-city flow when ingesting Yandex Geocoder localities to make
 * sure "г. Москва", "Москва, Россия", and " Москва " all collide on the same
 * row instead of creating duplicates.
 */

const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
  ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/**
 * Strips common Yandex prefixes / suffixes and normalises whitespace.
 *
 * Examples:
 *   "г. Москва"             → "Москва"
 *   "г Москва"              → "Москва"
 *   "Москва, Россия"        → "Москва"
 *   "  Воронеж  "           → "Воронеж"
 *   "Нижний  Новгород"      → "Нижний Новгород"
 */
export function normalizeCityName(raw: string): string {
  return raw
    // 1. Trim first — otherwise leading whitespace would prevent the
    //    "^г." prefix anchor from matching ("  г. Москва" → "г. Москва").
    .trim()
    // 2. Strip "г.", "г " prefix.
    .replace(/^г\.?\s+/i, "")
    // 3. Drop ", Россия" / ", Московская область" tail.
    .replace(/,.*$/, "")
    // 4. Final trim + collapse whitespace runs.
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Russian → URL-safe Latin slug.
 *
 * Examples:
 *   "Москва"           → "moskva"
 *   "Воронеж"          → "voronezh"
 *   "Санкт-Петербург"  → "sankt-peterburg"
 *   "Нижний Новгород"  → "nizhniy-novgorod"
 */
export function citySlugFromName(name: string): string {
  return name
    .toLowerCase()
    .split("")
    .map((ch) => (ch in CYRILLIC_TO_LATIN ? CYRILLIC_TO_LATIN[ch] : ch))
    .join("")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}
