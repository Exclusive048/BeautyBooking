import { NATIVE_PUSH_REQUEST_TIMEOUT_MS } from "@/lib/notifications/native-push/types";

/**
 * MOBILE-B2 — HTTP-запрос к сервису доставки с границей времени (RES-22).
 * Бросает на сети и таймауте — клиент провайдера превращает это в `retry`.
 * Тело ответа разбирается, но наружу (в лог) не уходит: в ответах FCM/RuStore
 * бывает эхо запроса, а в запросе — токен устройства.
 */
export type HttpJsonResponse = { status: number; json: unknown };

export async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: { method?: "POST"; headers: Record<string, string>; body: string },
  timeoutMs: number = NATIVE_PUSH_REQUEST_TIMEOUT_MS,
): Promise<HttpJsonResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: init.method ?? "POST",
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text().catch(() => "");
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `{ error: { code, message, status, details } }` — форма Google API (FCM, RuStore). */
export function readGoogleStyleError(json: unknown): { status: string | null; message: string; details: unknown[] } {
  const error = isRecord(json) && isRecord(json.error) ? json.error : null;
  return {
    status: error && typeof error.status === "string" ? error.status : null,
    message: error && typeof error.message === "string" ? error.message : "",
    details: error && Array.isArray(error.details) ? error.details : [],
  };
}
