import type { ErrorCode } from "@/lib/api/errors";
import type { ApiResponse } from "@/lib/types/api";

export type ApiClientErrorShape = {
  message: string;
  code?: ErrorCode;
  status: number;
};

export class ApiClientError extends Error {
  readonly code?: ErrorCode;
  readonly status: number;

  constructor(input: ApiClientErrorShape) {
    super(input.message);
    this.code = input.code;
    this.status = input.status;
  }
}

const DEFAULT_ERROR_MESSAGE = "Request failed";

export function getErrorMessageByCode(code?: ErrorCode): string | null {
  if (!code) return null;
  const map: Partial<Record<ErrorCode, string>> = {
    VALIDATION_ERROR: "Please check the form fields.",
    UNAUTHORIZED: "Please sign in to continue.",
    FORBIDDEN: "You do not have access to this action.",
    BOOKING_CONFLICT: "This time slot is no longer available.",
    SLOT_CONFLICT: "This time slot is no longer available.",
    SERVICE_DISABLED: "Selected service is not available.",
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
    const message =
      (json && !json.ok ? json.error?.message : null) ??
      res.statusText ??
      DEFAULT_ERROR_MESSAGE;
    const code = json && !json.ok ? json.error?.code : undefined;
    throw new ApiClientError({ message, code, status: res.status });
  }

  if (!json || !json.ok) {
    const message = json?.error?.message ?? DEFAULT_ERROR_MESSAGE;
    const code = json?.error?.code;
    throw new ApiClientError({ message, code, status: res.status });
  }

  return json.data;
}
