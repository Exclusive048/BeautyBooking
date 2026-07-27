import { NextResponse } from "next/server";
import type { ErrorCode } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { track5xxError } from "@/lib/monitoring/api-alerts";
import { shouldReportFailure } from "@/lib/observability/noise";
import { reportMessage } from "@/lib/observability/report";

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
  // SECURITY-EXPOSURE-AUDIT-01 · B2: the ~150 routes on this envelope never
  // surfaced their 5xx to ops/error-tracking (only `response.ts` `fail()` did).
  // Mirror it here — purely additive, no response-shape change. Details are
  // NOT forwarded to the reporter (only message/code), matching `fail()`.
  if (status >= 500) {
    logError(message, { status, code, requestId: payload.response.requestId, __skipAlert: true });
    track5xxError("", payload.response.requestId, message);
    if (shouldReportFailure(status, code)) {
      reportMessage(message, {
        level: "error",
        tags: { http_status: status, error_code: code },
        extra: { requestId: payload.response.requestId },
      });
    }
  }
  return NextResponse.json<ApiError>(payload.response, { status: payload.status });
}
