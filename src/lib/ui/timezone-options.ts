/**
 * FIX-R2-02-A — curated IANA timezone options for the cabinet selector
 * (master + studio). Client-safe (Rule 13): only depends on the pure
 * {@link TZ_CITY_RF} label map, no server-only imports.
 *
 * 29.09 доработки · 28 (решения владельца 28.1–28.4): ВЫБРАТЬ можно только
 * пояс России; ПОДПИСЫВАТЬ время словарь `zone-label.ts` продолжает и для зон
 * СНГ. Списки выводятся из блока РФ словаря (`TZ_CITY_RF`), поэтому зона СНГ в
 * выбор не попадёт иначе как правкой словаря — это стережёт тест.
 *
 * `value` — IANA id (по нему считает движок), `label` — город + id, чтобы
 * выбор был однозначным. Текущая зона вне списка показывается первой
 * ({@link buildTimezoneOptions}) — живой провайдер на `Asia/Almaty` её видит и
 * не теряет (28.4), но выбрать её заново после смены нельзя.
 */
import { TZ_CITY_RF, TZ_CITY_RU } from "@/lib/ui/zone-label";

export type TimezoneOption = { value: string; label: string };

/**
 * Кабинет мастера и студии: по одной зоне на каждое смещение РФ (UTC+2 … +12),
 * запад → восток. 27 зон с одинаковыми смещениями только мешали бы выбору.
 */
export const RF_PICKER_TIMEZONES: readonly string[] = [
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
];

/**
 * Админка городов (решение 28.2): все зоны РФ — город это справочник, и точная
 * зона (`Europe/Volgograd`, `Asia/Novokuznetsk`) там уместна.
 */
export const RF_ADMIN_TIMEZONES: readonly string[] = Object.keys(TZ_CITY_RF);

/** Подпись — по полному словарю: текущая зона СНГ (28.4) тоже «Алматы (Asia/Almaty)». */
function toOption(tz: string): TimezoneOption {
  const city = TZ_CITY_RU[tz];
  return { value: tz, label: city ? `${city} (${tz})` : tz };
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = RF_PICKER_TIMEZONES.map(toOption);

/**
 * Опции списка, где текущая зона гарантированно есть — первой, если её нет в
 * списке (никогда не теряем сохранённое значение провайдера или города).
 */
export function buildTimezoneOptions(
  current: string | null | undefined,
  list: readonly string[] = RF_PICKER_TIMEZONES,
): TimezoneOption[] {
  const options = list.map(toOption);
  const trimmed = current?.trim();
  if (!trimmed || list.includes(trimmed)) return options;
  return [toOption(trimmed), ...options];
}

/**
 * Серверная проверка записи пояса (решение 28.3): зона России ИЛИ текущее
 * значение без изменений — иначе сохранение других полей у провайдера на старой
 * зоне СНГ начало бы падать. Условие «или текущее» требует знать текущее
 * значение, поэтому проверка живёт в сервисах записи, а не в Zod-схеме.
 */
export function isSelectableTimeZone(next: string, current: string | null | undefined): boolean {
  const trimmed = next.trim();
  return RF_ADMIN_TIMEZONES.includes(trimmed) || trimmed === current?.trim();
}
