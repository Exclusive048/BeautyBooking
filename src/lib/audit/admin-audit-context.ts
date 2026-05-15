import { getClientIp } from "@/lib/http/ip";

export type AdminAuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

const USER_AGENT_MAX_LENGTH = 512;

/** Pulls IP + User-Agent off the incoming request. Both fields are
 * best-effort — missing or unparseable headers produce `null` rather
 * than an error, since audit context must never block the underlying
 * admin action. */
export function getAdminAuditContext(req: Request): AdminAuditContext {
  const rawIp = getClientIp(req);
  const ipAddress = rawIp === "unknown" ? null : rawIp;

  const rawUa = req.headers.get("user-agent");
  const trimmedUa = rawUa?.trim() ?? "";
  const userAgent =
    trimmedUa.length === 0
      ? null
      : trimmedUa.length > USER_AGENT_MAX_LENGTH
        ? trimmedUa.slice(0, USER_AGENT_MAX_LENGTH)
        : trimmedUa;

  return { ipAddress, userAgent };
}

/** Empty context for service-layer call sites that don't have a
 * request (e.g. background workers acting on behalf of an admin).
 * Prefer plumbing the real `Request` through whenever possible. */
export const EMPTY_ADMIN_AUDIT_CONTEXT: AdminAuditContext = {
  ipAddress: null,
  userAgent: null,
};
