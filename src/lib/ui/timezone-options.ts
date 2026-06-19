/**
 * FIX-R2-02-A — curated IANA timezone options for the cabinet selector
 * (master + studio). Client-safe (Rule 13): only depends on the pure
 * {@link TZ_CITY_RU} label map, no server-only imports.
 *
 * The selector defaults to the city-derived `Provider.timezone` but a provider
 * may override it here. The list covers the RU/CIS market's real zones in
 * west→east order. `value` is the IANA id (what the engine resolves against);
 * `label` is the Russian city + IANA id so the choice is unambiguous.
 *
 * If a provider already carries a timezone outside this curated set (e.g. an
 * admin set an exotic one), callers should prepend the current value so it
 * stays selectable — see {@link buildTimezoneOptions}.
 */
import { TZ_CITY_RU } from "@/lib/ui/zone-label";

export type TimezoneOption = { value: string; label: string };

/** Ordered west→east; mirrors the admin city tz list + key CIS zones. */
const CURATED_TIMEZONES: string[] = [
  "Europe/Kaliningrad",
  "Europe/Moscow",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Yakutsk",
  "Asia/Vladivostok",
  "Asia/Magadan",
  "Asia/Kamchatka",
  // CIS
  "Asia/Almaty",
  "Asia/Tashkent",
  "Asia/Bishkek",
  "Europe/Minsk",
];

function toOption(tz: string): TimezoneOption {
  const city = TZ_CITY_RU[tz];
  return { value: tz, label: city ? `${city} (${tz})` : tz };
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = CURATED_TIMEZONES.map(toOption);

/**
 * Returns the curated options, guaranteeing `current` is present + first-ish so
 * the selector always reflects the stored value even if it's outside the
 * curated set (never silently drops/loses the provider's actual tz).
 */
export function buildTimezoneOptions(current: string | null | undefined): TimezoneOption[] {
  const trimmed = current?.trim();
  if (!trimmed || CURATED_TIMEZONES.includes(trimmed)) {
    return TIMEZONE_OPTIONS;
  }
  return [toOption(trimmed), ...TIMEZONE_OPTIONS];
}
