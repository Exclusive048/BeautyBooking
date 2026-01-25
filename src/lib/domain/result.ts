export type StatusCode = 400 | 401 | 403 | 404 | 409 | 429 | 500;

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: StatusCode; message: string; code?: string };
