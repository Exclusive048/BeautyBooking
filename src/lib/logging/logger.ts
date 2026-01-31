import { randomUUID } from "crypto";

export type LogMeta = Record<string, unknown>;

export function logInfo(message: string, meta: LogMeta = {}) {
  console.log(JSON.stringify({ level: "info", message, ...meta }));
}

export function logError(message: string, meta: LogMeta = {}) {
  console.error(JSON.stringify({ level: "error", message, ...meta }));
}

export function getRequestId(req: Request): string {
  const header = req.headers.get("x-request-id");
  if (header && header.trim().length > 0) return header.trim();
  return randomUUID();
}
