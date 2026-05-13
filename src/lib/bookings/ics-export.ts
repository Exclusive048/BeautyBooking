/**
 * Minimal iCalendar (.ics) generator for one booking. We stick to the bits
 * Google Calendar / Apple Calendar / Outlook all parse: VEVENT with UID,
 * DTSTAMP, DTSTART, DTEND, SUMMARY, optional LOCATION/DESCRIPTION.
 *
 * Times are emitted as UTC (Z suffix) — viewer's calendar converts to local.
 * Line endings are CRLF per RFC 5545. We don't fold long lines (75-char
 * rule) yet — addresses + service titles stay well under in practice; if
 * we ever truncate fold logic should land here.
 */

export type IcsEvent = {
  uid: string;
  summary: string;
  start: string;
  end: string;
  location?: string | null;
  description?: string | null;
};

function fmtUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date for .ics: ${iso}`);
  return (
    d.toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")
  );
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function generateIcs(event: IcsEvent): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//МастерРядом//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${fmtUtc(new Date().toISOString())}`,
    `DTSTART:${fmtUtc(event.start)}`,
    `DTEND:${fmtUtc(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
