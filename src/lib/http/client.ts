import type { ErrorCode } from "@/lib/api/errors";
import type { ApiResponse } from "@/lib/types/api";

export type ApiClientErrorShape = {
  message: string;
  code?: ErrorCode;
  status: number;
  fromServer?: boolean;
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

  constructor(input: ApiClientErrorShape) {
    super(input.message);
    this.code = input.code;
    this.status = input.status;
    this.fromServer = input.fromServer ?? false;
  }
}

const DEFAULT_ERROR_MESSAGE = "Что-то пошло не так - попробуйте еще раз.";

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

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const json = await readJson<T>(res);

  if (!res.ok) {
    // FIX-C3: `res.statusText` из цепочки убран. Это строка протокола («Too
    // Many Requests», «Forbidden») — всегда английская и никогда не адресована
    // пользователю; попадая сюда, она выигрывала у русского дефолта просто
    // потому, что стояла раньше. `check:error-message-lang` этого не видит по
    // построению: гейт сторожит СЕРВЕРНЫЕ конверты, а здесь клиент.
    const serverMessage = json && !json.ok ? json.error?.message : null;
    const code = json && !json.ok ? json.error?.code : undefined;
    throw new ApiClientError({
      message: serverMessage ?? DEFAULT_ERROR_MESSAGE,
      code,
      status: res.status,
      fromServer: Boolean(serverMessage),
    });
  }

  if (!json || !json.ok) {
    const serverMessage = json?.error?.message ?? null;
    const code = json?.error?.code;
    throw new ApiClientError({
      message: serverMessage ?? DEFAULT_ERROR_MESSAGE,
      code,
      status: res.status,
      fromServer: Boolean(serverMessage),
    });
  }

  return json.data;
}
