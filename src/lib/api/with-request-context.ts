import { randomUUID } from "crypto";
import { withRequestId } from "@/lib/logging/logger";

function resolveRequestId(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header && header.trim().length > 0) return header.trim();
  return randomUUID();
}

export function withRequestContext<T>(
  request: Request,
  handler: () => Promise<T> | T
): Promise<T> {
  const requestId = resolveRequestId(request);
  return Promise.resolve(withRequestId(requestId, handler));
}
