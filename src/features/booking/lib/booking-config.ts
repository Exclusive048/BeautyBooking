import type { ApiResponse } from "@/lib/types/api";

export type ServiceBookingQuestion = {
  id: string;
  text: string;
  required: boolean;
  order: number;
};

export type ServiceBookingConfig = {
  requiresReferencePhoto: boolean;
  questions: ServiceBookingQuestion[];
};

async function safeJson<T>(res: Response) {
  return (await res.json().catch(() => null)) as T | null;
}

export async function fetchPublicServiceBookingConfig(serviceId: string): Promise<ServiceBookingConfig | null> {
  const res = await fetch(`/api/public/services/${serviceId}/booking-config`, { cache: "no-store" });
  const json = await safeJson<ApiResponse<ServiceBookingConfig>>(res);

  if (!res.ok || !json || json.ok !== true) return null;
  return json.data;
}

export async function uploadBookingReference(
  file: File
): Promise<{ ok: true; assetId: string } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.set("image", file);

  const res = await fetch("/api/bookings/upload-reference", { method: "POST", body: formData });
  const json = await safeJson<ApiResponse<{ assetId: string }>>(res);

  if (!res.ok || !json || json.ok !== true) {
    return {
      ok: false,
      error: json && json.ok === false ? json.error.message : `API error: ${res.status}`,
    };
  }

  return { ok: true, assetId: json.data.assetId };
}
