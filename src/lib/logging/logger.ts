import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import { alertError } from "@/lib/monitoring";

export type LogMeta = Record<string, unknown>;

type RequestContext = {
  requestId: string;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

function normalizeRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function withRequestId<T>(requestId: string, fn: () => T): T {
  const normalized = normalizeRequestId(requestId) ?? randomUUID();
  return requestContext.run({ requestId: normalized }, fn);
}

export function logInfo(message: string, meta: LogMeta = {}) {
  const { requestId: rawRequestId, ...restMeta } = meta;
  const requestId = normalizeRequestId(rawRequestId) ?? getRequestId();
  console.log(
    JSON.stringify({
      level: "info",
      message,
      requestId,
      timestamp: new Date().toISOString(),
      ...restMeta,
    })
  );
}

export function logError(message: string, meta: LogMeta = {}) {
  const { requestId: rawRequestId, ...restMeta } = meta;
  const requestId = normalizeRequestId(rawRequestId) ?? getRequestId();
  console.error(
    JSON.stringify({
      level: "error",
      message,
      requestId,
      timestamp: new Date().toISOString(),
      ...restMeta,
    })
  );
  const skipAlert = Boolean((meta as { __skipAlert?: boolean }).__skipAlert);
  if (typeof window === "undefined" && !skipAlert) {
    void alertError(message, { requestId, ...restMeta });
  }
}

export function getRequestId(req?: Request): string {
  const headerRequestId = req ? normalizeRequestId(req.headers.get("x-request-id")) : null;
  if (headerRequestId) {
    const current = requestContext.getStore()?.requestId;
    if (current !== headerRequestId) {
      requestContext.enterWith({ requestId: headerRequestId });
    }
    return headerRequestId;
  }

  const contextRequestId = requestContext.getStore()?.requestId;
  if (contextRequestId) return contextRequestId;

  const generated = randomUUID();
  requestContext.enterWith({ requestId: generated });
  return generated;
}
