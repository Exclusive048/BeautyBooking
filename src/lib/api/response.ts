import { NextResponse } from "next/server";
import type { ErrorCode } from "@/lib/api/errors";

type ApiOk<T> = {
  ok: true;
  data: T;
};

type ApiError = {
  ok: false;
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
  return NextResponse.json<ApiError>(
    { ok: false, error: { message, code, details } },
    { status }
  );
}
