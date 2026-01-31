import type { ErrorCode } from "@/lib/api/errors";

export type ApiOk<T> = { ok: true; data: T };
export type ApiError = { ok: false; error: { message: string; code?: ErrorCode; details?: unknown } };
export type ApiResponse<T> = ApiOk<T> | ApiError;
