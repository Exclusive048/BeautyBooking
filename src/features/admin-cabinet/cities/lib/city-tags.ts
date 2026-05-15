/**
 * 3-letter display tag for cities. Hard-coded map covers the top-30
 * Russian cities (plus Astana / Almaty for KZ) so well-known cities
 * get the familiar airport-style code; everything else falls back to
 * `slug.replace(/-/g, "").slice(0,3).toUpperCase()`.
 *
 * Display-only — never persisted. If admins eventually need custom
 * codes, a `City.tag` column needs to be added (see BACKLOG.md).
 */

const CITY_TAG_MAP: Readonly<Record<string, string>> = {
  moskva: "MSK",
  "sankt-peterburg": "SPB",
  ekaterinburg: "EKB",
  novosibirsk: "NSK",
  kazan: "KZN",
  "nizhniy-novgorod": "NN",
  "rostov-na-donu": "RND",
  krasnodar: "KDR",
  samara: "SAM",
  voronezh: "VRN",
  sochi: "SCH",
  ufa: "UFA",
  chelyabinsk: "CHL",
  omsk: "OMS",
  krasnoyarsk: "KRS",
  perm: "PRM",
  volgograd: "VLG",
  saratov: "SRT",
  tyumen: "TMN",
  tolyatti: "TLT",
  izhevsk: "IZH",
  barnaul: "BRN",
  irkutsk: "IRK",
  ulyanovsk: "ULN",
  khabarovsk: "KHV",
  yaroslavl: "YAR",
  vladivostok: "VLV",
  makhachkala: "MKH",
  tomsk: "TMS",
  orenburg: "ORE",
  // CIS — kept for symmetry with the seed-cities set.
  astana: "AST",
  almaty: "ALA",
};

export function getCityTag(slug: string): string {
  const known = CITY_TAG_MAP[slug];
  if (known) return known;
  // Fallback: strip dashes, take first 3 chars, uppercase. "kaluga" → "KAL",
  // "veliky-novgorod" → "VEL", "abakan" → "ABA".
  const compact = slug.replace(/-/g, "");
  if (compact.length === 0) return "—";
  return compact.slice(0, 3).toUpperCase();
}
