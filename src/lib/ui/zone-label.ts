/**
 * QA-107 / FIX-22 — explicit salon-timezone zone label.
 *
 * Product decision: every client-facing appointment time is shown in the
 * **salon's (entity) timezone** — never silently converted to the viewer's
 * zone — and annotated with an explicit «(город, GMT+N)» label so a viewer in
 * a different zone is never confused about which clock the time refers to.
 *
 * This module is the single source of truth for that label. Pure string/Intl
 * logic, no server-only imports (Rule 13) → safe in both client and server
 * (reminders are server-rendered and have no browser `Intl` viewer context, so
 * they always show the label unconditionally).
 *
 * Uniformity note: the city in the label is resolved from the **timezone** via
 * {@link TZ_CITY_RU} (a bounded RU/CIS set) so the SAME booking shows the SAME
 * label across every surface (slot picker → confirmation → «Мои записи» →
 * reminder), regardless of which DTO loaded which provider fields. Callers may
 * pass an explicit `city` to override (e.g. the exact profile city) — but the
 * default keeps the label uniform by construction. The GMT offset is always
 * exact and DST-aware for the appointment instant; the salon's precise
 * address/city is shown separately on each surface.
 */

/**
 * IANA timezone → Russian city name for the zone label. Covers the RU/CIS
 * market's real timezones. An unmapped tz falls back to an offset-only label
 * («(GMT+5)») — still unambiguous, never wrong.
 */
export const TZ_CITY_RU: Record<string, string> = {
  "Europe/Kaliningrad": "Калининград",
  "Europe/Moscow": "Москва",
  "Europe/Simferopol": "Симферополь",
  "Europe/Volgograd": "Волгоград",
  "Europe/Kirov": "Киров",
  "Europe/Astrakhan": "Астрахань",
  "Europe/Saratov": "Саратов",
  "Europe/Ulyanovsk": "Ульяновск",
  "Europe/Samara": "Самара",
  "Asia/Yekaterinburg": "Екатеринбург",
  "Asia/Omsk": "Омск",
  "Asia/Novosibirsk": "Новосибирск",
  "Asia/Barnaul": "Барнаул",
  "Asia/Tomsk": "Томск",
  "Asia/Krasnoyarsk": "Красноярск",
  "Asia/Novokuznetsk": "Новокузнецк",
  "Asia/Irkutsk": "Иркутск",
  "Asia/Chita": "Чита",
  "Asia/Yakutsk": "Якутск",
  "Asia/Vladivostok": "Владивосток",
  "Asia/Khandyga": "Хандыга",
  "Asia/Sakhalin": "Южно-Сахалинск",
  "Asia/Magadan": "Магадан",
  "Asia/Srednekolymsk": "Среднеколымск",
  "Asia/Ust-Nera": "Усть-Нера",
  "Asia/Kamchatka": "Петропавловск-Камчатский",
  "Asia/Anadyr": "Анадырь",
  // CIS
  "Asia/Almaty": "Алматы",
  "Asia/Qyzylorda": "Кызылорда",
  "Asia/Aqtobe": "Актобе",
  "Asia/Aqtau": "Актау",
  "Asia/Atyrau": "Атырау",
  "Asia/Oral": "Уральск",
  "Asia/Tashkent": "Ташкент",
  "Asia/Bishkek": "Бишкек",
  "Asia/Dushanbe": "Душанбе",
  "Asia/Ashgabat": "Ашхабад",
  "Europe/Minsk": "Минск",
  "Europe/Kyiv": "Киев",
  "Asia/Tbilisi": "Тбилиси",
  "Asia/Yerevan": "Ереван",
  "Asia/Baku": "Баку",
};

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso || !String(iso).trim()) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Offset of `timeZone` from UTC, in minutes, for the given instant — DST-aware
 * (computed for the appointment date's rules, not "now"). Returns null when the
 * tz/instant can't be resolved (caller must flag, never fall back to host tz).
 */
export function getZoneOffsetMinutes(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
): number | null {
  const date = parseIso(iso);
  if (!date || !timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(date);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    // "GMT+05:00" | "GMT-03:30" | "GMT" | "UTC"
    const m = name.match(/(?:GMT|UTC)\s*([+-])(\d{1,2})(?::(\d{2}))?/i);
    if (!m) {
      // Pure "GMT"/"UTC" with no offset → 0.
      return /^(GMT|UTC)$/i.test(name.trim()) ? 0 : null;
    }
    const sign = m[1] === "-" ? -1 : 1;
    const hours = Number(m[2] ?? "0");
    const mins = Number(m[3] ?? "0");
    return sign * (hours * 60 + mins);
  } catch {
    return null;
  }
}

/** Format an offset (minutes) as «GMT+5», «GMT+5:30», «GMT», «GMT-3». */
export function formatGmtOffset(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "GMT";
  const sign = offsetMinutes > 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `GMT${sign}${h}` : `GMT${sign}${h}:${String(m).padStart(2, "0")}`;
}

type ZoneLabelInput = {
  iso: string | null | undefined;
  timeZone: string | null | undefined;
  /** Explicit override for the city in the label; defaults to TZ_CITY_RU[timeZone]. */
  city?: string | null;
};

/**
 * The explicit zone label, e.g. «(Алматы, GMT+5)» or «(GMT+5)» when the city is
 * unknown. Returns "" when the tz/instant can't be resolved — callers must NOT
 * substitute a host/browser tz; they show the label-less time and (ideally)
 * flag the missing data.
 */
export function formatZoneLabel({ iso, timeZone, city }: ZoneLabelInput): string {
  const offset = getZoneOffsetMinutes(iso, timeZone);
  if (offset === null) return "";
  const gmt = formatGmtOffset(offset);
  const cityName = (city ?? (timeZone ? TZ_CITY_RU[timeZone] : undefined))?.trim();
  return cityName ? `(${cityName}, ${gmt})` : `(${gmt})`;
}

/**
 * True when the salon's zone offset differs from the viewer's for the
 * appointment instant — i.e. the displayed salon time would NOT match the
 * viewer's own wall clock, so the label must be emphasized/shown. When they
 * match (same offset → same displayed number), the label may be omitted to keep
 * the common same-city case clean. Returns true (show) if either side can't be
 * resolved, erring toward clarity.
 */
export function zonesDifferForViewer({
  iso,
  salonTimeZone,
  viewerTimeZone,
}: {
  iso: string | null | undefined;
  salonTimeZone: string | null | undefined;
  viewerTimeZone: string | null | undefined;
}): boolean {
  const salon = getZoneOffsetMinutes(iso, salonTimeZone);
  const viewer = getZoneOffsetMinutes(iso, viewerTimeZone);
  if (salon === null || viewer === null) return true;
  return salon !== viewer;
}
