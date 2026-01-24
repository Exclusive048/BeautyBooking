export type ApiOk<T> = { ok: true; data: T };
export type ApiError = { ok: false; error: { message: string; code?: string } };
export type ApiResponse<T> = ApiOk<T> | ApiError;
