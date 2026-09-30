import { DEFAULT_ERROR_MESSAGE, fetchJson, serverMessageOr } from "@/lib/http/client";

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

export async function fetchPublicServiceBookingConfig(serviceId: string): Promise<ServiceBookingConfig | null> {
  // Чтение: без настроек записи форма работает с настройками по умолчанию.
  try {
    return await fetchJson<ServiceBookingConfig>(`/api/public/services/${serviceId}/booking-config`, {
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

export async function uploadBookingReference(
  file: File
): Promise<{ ok: true; assetId: string } | { ok: false; error: string }> {
  const formData = new FormData();
  formData.set("image", file);

  try {
    const data = await fetchJson<{ assetId: string }>("/api/bookings/upload-reference", {
      method: "POST",
      body: formData,
    });
    return { ok: true, assetId: data.assetId };
  } catch (error) {
    // Размер, тип файла, лимит — отказы сервера дословно.
    return { ok: false, error: serverMessageOr(error, DEFAULT_ERROR_MESSAGE) };
  }
}
