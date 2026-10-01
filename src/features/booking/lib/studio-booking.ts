import * as UI_TEXT from "@/lib/ui/text";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import type { ConsentFlags } from "@/lib/legal/consent-flags";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { ApiClientError, fetchJson, serverMessageOr } from "@/lib/http/client";
import { UI_FMT } from "@/lib/ui/fmt";

export type StudioMaster = {
  id: string;
  name: string;
  /** Optional for back-compat with older payloads: absent → initials. */
  avatarUrl?: string | null;
  publicUsername: string | null;
  /**
   * STUDIO-MASTER-PROFILES (этап 4): описание и рейтинг профиля мастера В
   * СТУДИИ — карточка команды берёт их отсюда, а не запросом профиля (у
   * профиля в студии нет публичной страницы). Необязательны для совместимости.
   */
  tagline?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  /**
   * `Provider.id`, чьи работы показывать миниатюрами в карточке: личный
   * профиль мастера, если его страница открыта (портфолио — личное).
   */
  portfolioProviderId?: string | null;
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
  /**
   * 29.09 доработки · 03: сколько дней вперёд у мастера видны окошки
   * (`publicBookingHorizonDays`). Нет — ограничивает только студия.
   */
  bookingHorizonDays?: number;
};

/**
 * Виджет студии в режиме «к мастеру» (мастер выбран ссылкой): только услуги,
 * которые этот мастер оказывает, — ровно то, что обещает подзаголовок «Только
 * то, что делает мастер». Раньше список был студийным целиком, и чужая услуга
 * вела в шаг «Когда» без единого окошка. `serviceIds` — те же включённые связи
 * мастера с услугами, по которым сервер принимает запись. Нет поля (старый
 * ответ) — вся студия, как было.
 */
export function servicesPerformedBy<T extends { id: string }>(
  services: T[],
  master: Pick<StudioMaster, "serviceIds"> | null,
): T[] {
  if (!master?.serviceIds) return services;
  const performed = new Set(master.serviceIds);
  return services.filter((service) => performed.has(service.id));
}
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
  | { ok: true; bookingId: string; manageUrl: string | null }
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
  daysAhead: number
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
    // Подпись — по самому ключу (UTC-tech): не съезжает на соседние сутки
    // ни при каком смещении зоны.
    out.push({ key, label: UI_FMT.dateKey(key, "weekdayDayMonthShort") });
  }
  return out;
}

const TS = UI_TEXT.publicStudio;

export async function fetchStudioProfile(studioId: string): Promise<StudioProfileResult> {
  try {
    const data = await fetchJson<{ provider: ProviderProfileDto | null }>(`/api/providers/${studioId}`, {
      cache: "no-store",
    });
    if (!data.provider) return { ok: false, error: TS.profileLoadFailed };
    return { ok: true, provider: data.provider };
  } catch (error) {
    return { ok: false, error: serverMessageOr(error, TS.profileLoadFailed) };
  }
}

export async function fetchStudioMasters(studioId: string): Promise<MastersResult> {
  try {
    const data = await fetchJson<{ masters: StudioMaster[] }>(`/api/providers/${studioId}/masters`, {
      cache: "no-store",
    });
    return { ok: true, masters: data.masters ?? [] };
  } catch (error) {
    return { ok: false, error: serverMessageOr(error, TS.mastersLoadFailed) };
  }
}

export async function fetchMasterAvailability(
  masterId: string,
  serviceId: string,
  dateKey: string
): Promise<AvailabilityResult> {
  if (!isValidDateKey(dateKey)) {
    return { ok: false, error: TS.dateInvalid, code: "DATE_INVALID" };
  }

  const url = new URL(`/api/masters/${masterId}/availability`, window.location.origin);
  url.searchParams.set("serviceId", serviceId);
  url.searchParams.set("from", dateKey);
  url.searchParams.set("limit", "1");

  try {
    const data = await fetchJson<{ slots: SlotItem[]; meta: { toDateExclusive: string } }>(url.toString(), {
      cache: "no-store",
    });
    return { ok: true, slots: data.slots ?? [] };
  } catch (error) {
    return {
      ok: false,
      error: serverMessageOr(error, TS.slotsLoadFailed),
      code: error instanceof ApiClientError ? error.code : undefined,
    };
  }
}

export async function fetchBookingMe() {
  // Фон: подставить данные вошедшему; не прочитали — как у гостя.
  try {
    const data = await fetchJson<{ user: BookingUser | null }>("/api/me", { method: "GET" });
    return data.user ?? null;
  } catch {
    return null;
  }
}

export async function createBooking(
  input: BookingCreateInput,
  /**
   * BOOKING-FLOW-AUDIT-RESIDUALS: ключ идемпотентности (инв. #28). Виджет
   * студии его не слал: повтор после оборванного ответа или двойной клик
   * создавали вторую запись на то же время.
   */
  idempotencyKey?: string,
): Promise<BookingCreateResult> {
  try {
    const data = await fetchJson<{ booking: { id: string }; manageUrl?: string | null }>("/api/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
      },
      body: JSON.stringify(input),
    });
    return { ok: true, bookingId: data.booking?.id ?? "ok", manageUrl: data.manageUrl ?? null };
  } catch (error) {
    // Обрыв сети — как и раньше, наверх: у вызывающего своя ветка про сеть.
    if (!(error instanceof ApiClientError)) throw error;
    if (error.status === 401 && error.code === "UNAUTHORIZED") {
      return { ok: false, error: "AUTH_REQUIRED", code: error.code, status: error.status };
    }
    // Серверная строка курируемая (AppError): «Укажите телефон», «Это время уже
    // занято», «Запись возможна не раньше чем за N ч» — на каждую из них
    // пользователь может отреагировать, а общий канон «попробуйте ещё раз»
    // для них прямо неверен (повтор даст тот же отказ).
    return {
      ok: false,
      error: serverMessageOr(error, TS.bookingError),
      code: error.code,
      status: error.status,
    };
  }
}
