import { UI_FMT } from "@/lib/ui/fmt";
import { formatZoneLabel } from "@/lib/ui/zone-label";

/**
 * Salon-local "DD.MM HH:MM (Город, GMT+N)" label for a booking instant.
 *
 * Single source of truth for the server-rendered notification "when" line —
 * shared by the in-app lifecycle path (`booking-notifications.ts`) and the
 * Telegram reminder path (`bookingTelegramService.ts`) so both render the time
 * in the SALON's timezone with an explicit zone label (SKILL-TZ, rule 8). These
 * are server-side messages with no browser viewer context, so the zone label is
 * always attached — the recipient can't silently mis-read the time against their
 * own clock (QA-107 / FIX-22 / HARDENING-09 #13).
 *
 * `date` is a UTC instant; `timeZone` is the salon/provider IANA zone. Returns
 * null when there is no instant (caller falls back to the slot label).
 */
export function formatBookingWhenLabel(date: Date | null, timeZone: string): string | null {
  if (!date) return null;
  const label = UI_FMT.date(date, "dayMonthNumericTime", { timeZone });
  const zone = formatZoneLabel({ iso: date.toISOString(), timeZone });
  return zone ? `${label} ${zone}` : label;
}
