import type { ApiResponse } from "@/lib/types/api";
import type { ProviderProfileDto } from "@/lib/providers/dto";

export type StudioMaster = { id: string; name: string };
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

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function buildDateBounds(base: Date, daysAhead: number = STUDIO_BOOKING_DAYS_AHEAD) {
  const min = toDateKey(base);
  const maxDate = new Date(base);
  maxDate.setDate(base.getDate() + daysAhead);
  const max = toDateKey(maxDate);
  return { min, max };
}

export function todayKey() {
  return toDateKey(new Date());
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
  if (!parseDateKey(dateKey)) {
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
      error: "Не удалось загрузить слоты",
    };
  }

  if (!json) {
    return { ok: false, error: "Не удалось загрузить слоты" };
  }

  if (json.ok !== true) {
    return { ok: false, error: json.error.message ?? "Не удалось загрузить слоты", code: json.error?.code };
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
