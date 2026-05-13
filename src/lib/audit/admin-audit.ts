import { Prisma, type AdminAuditAction } from "@prisma/client";
import { logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import type { AdminAuditContext } from "@/lib/audit/admin-audit-context";

export type CreateAdminAuditLogInput = {
  adminUserId: string;
  action: AdminAuditAction;
  targetType?: string | null;
  targetId?: string | null;
  /** Structured detail object. Pass plain JSON-compatible values
   * only. Defaults to JSON `null` if omitted. */
  details?: Prisma.InputJsonValue;
  reason?: string | null;
  context?: AdminAuditContext;
  /** Pass the transaction client when the audit write must be atomic
   * with the surrounding business mutation. Omit to write outside any
   * transaction. */
  tx?: Prisma.TransactionClient;
};

/** Writes a single row to `AdminAuditLog`. **Throws** on failure —
 * use inside `prisma.$transaction(...)` so a failed audit rolls back
 * the business mutation. For non-critical call sites that can survive
 * audit loss, prefer {@link createAdminAuditLogSafe}. */
export async function createAdminAuditLog(input: CreateAdminAuditLogInput) {
  const client = input.tx ?? prisma;

  return client.adminAuditLog.create({
    data: {
      adminUserId: input.adminUserId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      details: input.details ?? Prisma.JsonNull,
      reason: input.reason ?? null,
      ipAddress: input.context?.ipAddress ?? null,
      userAgent: input.context?.userAgent ?? null,
    },
  });
}

/** Best-effort variant for write sites **outside** a transaction.
 * Swallows errors and emits a structured log instead — losing one
 * audit row is preferable to surfacing a 500 to the admin user. Do
 * not use this inside transactions; failures there should propagate
 * to roll the surrounding mutation back. */
export async function createAdminAuditLogSafe(input: CreateAdminAuditLogInput) {
  try {
    return await createAdminAuditLog(input);
  } catch (error) {
    logError("admin-audit.create.failed", {
      action: input.action,
      adminUserId: input.adminUserId,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
