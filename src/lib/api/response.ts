import { NextResponse } from "next/server";
import type { ErrorCode } from "@/lib/api/errors";
import { getRequestId } from "@/lib/logging/logger";

type ApiOk<T> = {
  ok: true;
  data: T;
};

type ApiError = {
  ok: false;
  requestId: string;
  error: {
    message: string;
    code?: ErrorCode | string;
    details?: unknown;
  };
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiOk<T>>({ ok: true, data }, init);
}

export function fail(
  message: string,
  status: number,
  code?: ErrorCode | string,
  details?: unknown
) {
  const requestId = getRequestId();
  return NextResponse.json<ApiError>(
    { ok: false, requestId, error: { message, code, details } },
    { status }
  );
}

export function tooManyRequests(retryAfterSeconds: number, message?: string, code?: ErrorCode | string) {
  const requestId = getRequestId();
  return NextResponse.json<ApiError>(
    {
      ok: false,
      requestId,
      error: {
        message: message ?? "Too many requests",
        code: code ?? "RATE_LIMITED",
        details: { retryAfterSeconds },
      },
    },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(retryAfterSeconds)) },
    }
  );
}
