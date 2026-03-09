import { NextResponse } from "next/server";
import type { ErrorCode } from "@/lib/api/errors";
import { getRequestId } from "@/lib/logging/logger";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFieldErrors = Record<string, string | string[]>;

export type ApiError = {
  ok: false;
  requestId: string;
  error: {
    message: string;
    code?: ErrorCode;
    details?: unknown;
    fieldErrors?: ApiFieldErrors;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function fail(
  status: number,
  message: string,
  code: ErrorCode,
  details?: unknown,
  fieldErrors?: ApiFieldErrors
): { response: ApiError; status: number } {
  const requestId = getRequestId();
  const errorPayload: ApiError["error"] =
    details === undefined && fieldErrors === undefined
      ? { message, code }
      : {
          message,
          code,
          ...(details === undefined ? {} : { details }),
          ...(fieldErrors === undefined ? {} : { fieldErrors }),
        };
  return { response: { ok: false, requestId, error: errorPayload }, status };
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>(ok(data), init);
}

export function jsonFail(
  status: number,
  message: string,
  code: ErrorCode,
  details?: unknown,
  fieldErrors?: ApiFieldErrors
) {
  const payload = fail(status, message, code, details, fieldErrors);
  return NextResponse.json<ApiError>(payload.response, { status: payload.status });
}
