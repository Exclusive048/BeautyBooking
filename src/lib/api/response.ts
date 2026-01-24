import { NextResponse } from "next/server";

type ApiOk<T> = {
  ok: true;
  data: T;
};

type ApiError = {
  ok: false;
  error: {
    message: string;
    code?: string;
  };
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiOk<T>>({ ok: true, data }, init);
}

export function fail(message: string, status: number, code?: string) {
  return NextResponse.json<ApiError>(
    { ok: false, error: { message, code } },
    { status }
  );
}
