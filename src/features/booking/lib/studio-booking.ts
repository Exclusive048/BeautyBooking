import type { ApiResponse } from "@/lib/types/api";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { ConsentFlags } from "@/lib/legal/consent-flags";
import { addDaysToDateKey, dateFromLocalDateKey } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";

export type StudioMaster = {
  id: string;
  name: string;
  publicUsername: string | null;
  // EXP-024: enabled MasterService ids — which services this master performs.
  // The booking wizard lists only masters whose `serviceIds` include the
  // chosen service, so it never offers (or probes `/availability` for) a
  // master who'd return 409 `SERVICE_INVALID`. Optional for back-compat with
  // any older payload shape; treated as "unknown → not assigned" when absent.
  serviceIds?: string[];
  // PACKAGE-STUDIO-SAME-MASTER-BUFFER: the master's between-bookings buffer,
  // pre-normalized server-side exactly as the create validator normalizes it.
  // The package wizard's cursor applies it between SAME-master components
  // (different masters keep buffer 0). Optional for back-compat; absent →
  // treated as 0 (the pre-fix behavior — never stricter than the validator
  // for different-master pairs).
  bufferMin?: number;
};
export type SlotItem = { startAtUtc: string; endAtUtc: string; label: string };
export type BookingUser = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
};

export type BookingCreateInput = {
  providerId: string;
  serviceId: string;
  masterProviderId?: string;
  startAtUtc: string;
  endAtUtc: string;
  slotLabel: string;
  clientName: string;
  clientPhone: string;
  comment: string | null;
  silentMode?: boolean;
  referencePhotoAssetId?: string | null;
  bookingAnswers?: BookingAnswerPayload[] | null;
  /**
   * RKN-FIX-02 — guest consent (152-ФЗ ст. 9 в ред. 156-ФЗ). Sent only for
   * guests; `POST /api/bookings` refuses to create a guest profile or booking
   * without both required purposes.
   */
  consent?: ConsentFlags;
};

export type BookingAnswerPayload = {
  questionId: string;
  questionText: string;
  answer: string;
};

export type BookingCreateResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string; code?: string; status?: number };

export type AvailabilityResult =
  | { ok: true; slots: SlotItem[] }
  | { ok: false; error: string; code?: string };

export type StudioProfileResult =
  | { ok: true; provider: ProviderProfileDto }
  | { ok: false; error: string };

export type MastersResult =
  | { ok: true; masters: StudioMaster[] }
  | { ok: false; error: string };

export const STUDIO_BOOKING_DAYS_AHEAD = 60;

/**
 * LOGIC-26 — tz-источник этих ключей: **salon-tz** (rule 17).
 *
 * Раньше день считался host-локальными геттерами (`getFullYear`/`getMonth`/
 * `getDate`), то есть по часам посетителя. Клиент из Калининграда (+2),
 * открывающий екатеринбургскую студию (+5) поздно вечером, получал выдачу
 * слотов на ВЧЕРАШНИЙ по меркам салона день: виджет открывался не на том дне,
 * и часть сегодняшних слотов была невидима. Данные это не портило (лечится
 * навигацией), но первый экран показывал не то.
 *
 * `toLocalDateKey`/`addDaysToDateKey` — те же хелперы, которыми пользуется
 * движок расписания; собственной арифметики дат здесь быть не должно.
 */
export function todayKey(timeZone: string) {
  return toLocalDateKey(new Date(), timeZone);
}

/** Проверка ФОРМЫ ключа (YYYY-MM-DD) — от таймзоны не зависит. */
function isValidDateKey(dateKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const [y, m, d] = dateKey.split("-").map(Number);
  return Boolean(y) && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

export function buildDateBounds(
  base: Date,
  timeZone: string,
  daysAhead: number = STUDIO_BOOKING_DAYS_AHEAD
) {
  const min = toLocalDateKey(base, timeZone);
  return { min, max: addDaysToDateKey(min, daysAhead) };
}

/** Список ближайших дней в tz салона: ключ (salon-local) + подпись для чипа. */
export function buildDayOptions(
  count: number,
  timeZone: string
): { key: string; label: string }[] {
  const first = todayKey(timeZone);
  const out: { key: string; label: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    const key = addDaysToDateKey(first, i);
    // Подпись строится из полудня салонного дня — так она не съезжает на
    // соседние сутки ни при каком смещении зоны.
    const noonUtc = dateFromLocalDateKey(key, timeZone, 12, 0);
    out.push({
      key,
      label: noonUtc.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        weekday: "short",
        timeZone,
      }),
    });
  }
  return out;
}

async function safeJson<T>(res: Response) {
  return (await res.json().catch(() => null)) as T | null;
}

export async function fetchStudioProfile(studioId: string): Promise<StudioProfileResult> {
  const res = await fetch(`/api/providers/${studioId}`, { cache: "no-store" });
  const json = await safeJson<ApiResponse<{ provider: ProviderProfileDto | null }>>(res);

  if (!res.ok) {
    return { ok: false, error: `API error: ${res.status}` };
  }

  if (!json) {
    return { ok: false, error: "Не удалось загрузить студию" };
  }

  if (json.ok !== true) {
    return { ok: false, error: json.error.message ?? "Не удалось загрузить студию" };
  }

  if (!json.data.provider) {
    return { ok: false, error: "Не удалось загрузить студию" };
  }

  return { ok: true, provider: json.data.provider };
}

export async function fetchStudioMasters(studioId: string): Promise<MastersResult> {
  const res = await fetch(`/api/providers/${studioId}/masters`, { cache: "no-store" });
  const json = await safeJson<ApiResponse<{ masters: StudioMaster[] }>>(res);

  if (!res.ok) {
    return { ok: false, error: `API error: ${res.status}` };
  }

  if (!json) {
    return { ok: false, error: "Не удалось загрузить мастеров" };
  }

  if (json.ok !== true) {
    return { ok: false, error: json.error.message ?? "Не удалось загрузить мастеров" };
  }

  return { ok: true, masters: json.data.masters ?? [] };
}

export async function fetchMasterAvailability(
  masterId: string,
  serviceId: string,
  dateKey: string
): Promise<AvailabilityResult> {
  if (!isValidDateKey(dateKey)) {
    return { ok: false, error: "Некорректная дата", code: "DATE_INVALID" };
  }

  const url = new URL(`/api/masters/${masterId}/availability`, window.location.origin);
  url.searchParams.set("serviceId", serviceId);
  url.searchParams.set("from", dateKey);
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await safeJson<ApiResponse<{ slots: SlotItem[]; meta: { toDateExclusive: string } }>>(res);

  if (!res.ok) {
    return {
      ok: false,
      error: "Не удалось загрузить окошки",
    };
  }

  if (!json) {
    return { ok: false, error: "Не удалось загрузить окошки" };
  }

  if (json.ok !== true) {
    return { ok: false, error: json.error.message ?? "Не удалось загрузить окошки", code: json.error?.code };
  }

  return { ok: true, slots: json.data.slots ?? [] };
}

export async function fetchBookingMe() {
  const res = await fetch("/api/me", { method: "GET" });
  const json = await safeJson<ApiResponse<{ user: BookingUser | null }>>(res);

  if (!json) return null;
  if (json.ok !== true) return null;
  return json.data.user ?? null;
}

export async function createBooking(input: BookingCreateInput): Promise<BookingCreateResult> {
  const res = await fetch("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const json = await safeJson<ApiResponse<{ booking: { id: string } }>>(res);
  const errorCode = json && json.ok !== true ? json.error?.code : undefined;

  if (res.status === 401 && errorCode === "UNAUTHORIZED") {
    return { ok: false, error: "AUTH_REQUIRED", code: errorCode, status: res.status };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: "Не удалось создать запись",
      code: errorCode,
      status: res.status,
    };
  }

  if (!json) {
    return { ok: false, error: "Не удалось создать запись", status: res.status };
  }

  if (json.ok !== true) {
    return {
      ok: false,
      error: json.error.message ?? "Не удалось создать запись",
      code: json.error?.code,
      status: res.status,
    };
  }

  return { ok: true, bookingId: json.data.booking?.id ?? "ok" };
}
