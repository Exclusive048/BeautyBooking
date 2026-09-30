import type { ErrorCode } from "@/lib/api/errors";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import type { ApiResponse } from "@/lib/types/api";

export type ApiClientErrorShape = {
  message: string;
  code?: ErrorCode;
  status: number;
  fromServer?: boolean;
  details?: unknown;
  fieldErrors?: Record<string, string | string[]>;
};

export class ApiClientError extends Error {
  readonly code?: ErrorCode;
  readonly status: number;
  /**
   * FIX-C3 — сервер прислал СВОЮ курируемую строку (а не подставился дефолт).
   *
   * Без этого признака вызывающий не может выбрать между «показать то, что
   * сказал сервер» и «показать свою, более уместную для этой поверхности
   * строку»: `message` непуст всегда. Ровно эта неразличимость и приводила к
   * тому, что поверхности выбирали простое — глотали ответ целиком и печатали
   * собственную догадку (`SMOKE-01 · F3`).
   */
  readonly fromServer: boolean;
  /** `error.details` конверта (например, число записей у ACTIVE_BOOKINGS) — как прислал сервер. */
  readonly details?: unknown;
  /** Ошибки полей отказа проверки (`validationError`) — как прислал сервер. */
  readonly fieldErrors?: Record<string, string | string[]>;

  constructor(input: ApiClientErrorShape) {
    super(input.message);
    this.code = input.code;
    this.status = input.status;
    this.fromServer = input.fromServer ?? false;
    this.details = input.details;
    this.fieldErrors = input.fieldErrors;
  }
}

export const DEFAULT_ERROR_MESSAGE = "Не получилось. Попробуйте ещё раз.";

/**
 * FIX-C8 — «показать курируемую строку сервера, иначе — свою».
 *
 * Это ЕДИНСТВЕННАЯ форма, в которой поверхность принимает решение из FIX-C3, и
 * вынесена она сюда не ради краткости. Признак `fromServer` бесполезен, пока
 * каждая поверхность читает его по-своему: `error.message` непуст ВСЕГДА (при
 * отсутствии тела туда встаёт `DEFAULT_ERROR_MESSAGE`), поэтому наивное
 * `catch (e) { setError(e.message) }` выглядит как passthrough, но на отказе без
 * тела печатает дефолт вместо более уместной строки поверхности — то есть чинит
 * F3 ценой обратного дефекта.
 *
 * 🔴 Помощник намеренно НЕ решает за вызывающего. Он отвечает на вопрос «сервер
 * прислал своё?», а «уместно ли это здесь» остаётся решением сайта: там, где у
 * поверхности есть более конкретный контекст, она проверяет `error.code` ДО
 * вызова и подставляет собственную строку (образец — потолок в
 * `reviews-preview.tsx`). Слепой passthrough на всех сайтах — та же
 * безответственность, что и слепая своя строка, только в другую сторону.
 */
export function serverMessageOr(error: unknown, fallback: string): string {
  return error instanceof ApiClientError && error.fromServer ? error.message : fallback;
}

/**
 * То же решение для каналов, где свою строку подставляет сам компонент (чип
 * автосохранения печатает канон из `UI_TEXT`, если сообщения нет): серверная
 * строка или `undefined`.
 */
export function serverMessageOf(error: unknown): string | undefined {
  return serverMessageOr(error, "") || undefined;
}

export function getErrorMessageByCode(code?: ErrorCode): string | null {
  if (!code) return null;
  const map: Partial<Record<ErrorCode, string>> = {
    VALIDATION_ERROR: "Проверьте заполненные поля.",
    UNAUTHORIZED: "Сначала нужно войти.",
    FORBIDDEN: "У вас нет доступа к этому действию.",
    BOOKING_CONFLICT: "Это окошко уже занято.",
    SLOT_CONFLICT: "Это окошко уже занято.",
    SERVICE_DISABLED: "Эта услуга сейчас недоступна.",
    CANCELLATION_DEADLINE_PASSED: "Отмена недоступна: срок отмены истёк.",
  };
  return map[code] ?? null;
}

async function readJson<T>(res: Response): Promise<ApiResponse<T> | null> {
  return (await res.json().catch(() => null)) as ApiResponse<T> | null;
}

/**
 * ЕДИНСТВЕННЫЙ разбор ответа API на клиенте (29.09 доработки · 11,
 * ERROR-MESSAGE-UI-HELPER): успех — `data`, отказ — `ApiClientError` с
 * `fromServer`. Для сайтов, которым нужен сам `Response` (свой `fetch` с
 * заголовками, `FormData`, выбор по статусу до разбора). Разбирать конверт
 * руками (`json.error?.message ?? …`) не нужно и нельзя: так на клиенте жили 49
 * вторых разборов, каждый без `fromServer`.
 */
export async function readApiResponse<T>(res: Response): Promise<T> {
  const json = await readJson<T>(res);
  if (res.ok && json && json.ok) return json.data;

  // FIX-C3: `res.statusText` в цепочку не входит. Это строка протокола («Too
  // Many Requests», «Forbidden») — всегда английская и никогда не адресована
  // пользователю; попадая сюда, она выигрывала у русского дефолта просто
  // потому, что стояла раньше. `check:error-message-lang` этого не видит по
  // построению: гейт сторожит СЕРВЕРНЫЕ конверты, а здесь клиент.
  const failure = json && !json.ok ? json.error : null;
  const serverMessage = failure?.message ?? null;
  throw new ApiClientError({
    message: serverMessage ?? DEFAULT_ERROR_MESSAGE,
    code: failure?.code,
    status: res.status,
    fromServer: Boolean(serverMessage),
    details: failure?.details,
    fieldErrors: failure?.fieldErrors,
  });
}

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  return readApiResponse<T>(await fetch(input, init));
}

/**
 * `fetchJson` для кабинетов: тот же разбор поверх `fetchWithAuth` (обновление
 * сессии и уход на `/login` по 401). На публичных страницах не использовать —
 * там 401 значит «покажи окно входа», а не «уведи со страницы».
 */
export async function fetchJsonWithAuth<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  return readApiResponse<T>(await fetchWithAuth(input, init));
}
