import { NextResponse } from "next/server";
import type { ErrorCode } from "@/lib/api/errors";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiError = {
  ok: false;
  error: {
    message: string;
    code?: ErrorCode;
    details?: unknown;
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
  details?: unknown
): { response: ApiError; status: number } {
  const errorPayload: ApiError["error"] = details === undefined ? { message, code } : { message, code, details };
  return { response: { ok: false, error: errorPayload }, status };
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>(ok(data), init);
}

export function jsonFail(
  status: number,
  message: string,
  code: ErrorCode,
  details?: unknown
) {
  const payload = fail(status, message, code, details);
  return NextResponse.json<ApiError>(payload.response, { status: payload.status });
}
