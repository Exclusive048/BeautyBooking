import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { clearLegalDraftModeCache } from "@/lib/legal/config";
import { logInfo } from "@/lib/logging/logger";
import { clearVisualSearchEnabledCache } from "@/lib/visual-search/config";

const updateSchema = z.object({
  onlinePaymentsEnabled: z.boolean().optional(),
  visualSearchEnabled: z.boolean().optional(),
  legalDraftMode: z.boolean().optional(),
}).refine(
  (value) =>
    value.onlinePaymentsEnabled !== undefined ||
    value.visualSearchEnabled !== undefined ||
    value.legalDraftMode !== undefined,
  { message: "At least one setting is required" },
);

const FLAG_DEFAULTS = {
  onlinePaymentsEnabled: false,
  visualSearchEnabled: false,
  // legalDraftMode defaults to true (banner visible) to match runtime semantics
  // in `getLegalDraftMode()`.
  legalDraftMode: true,
} as const;

function parseFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

async function readAllFlags() {
  const [onlinePayments, visualSearch, legalDraft] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { key: "onlinePaymentsEnabled" },
      select: { value: true },
    }),
    prisma.systemConfig.findUnique({
      where: { key: "visualSearchEnabled" },
      select: { value: true },
    }),
    prisma.systemConfig.findUnique({
      where: { key: "legalDraftMode" },
      select: { value: true },
    }),
  ]);

  return {
    onlinePaymentsEnabled: parseFlag(onlinePayments?.value, FLAG_DEFAULTS.onlinePaymentsEnabled),
    visualSearchEnabled: parseFlag(visualSearch?.value, FLAG_DEFAULTS.visualSearchEnabled),
    legalDraftMode: parseFlag(legalDraft?.value, FLAG_DEFAULTS.legalDraftMode),
  };
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const flags = await readAllFlags();
  return ok(flags);
}

export async function PATCH(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const before = await readAllFlags();
    const changed: Record<string, { before: boolean; after: boolean }> = {};
    const auditContext = getAdminAuditContext(req);

    // All upserts + audit rows live in a single transaction so a
    // failed audit write rolls back the flag flip. Cache busts run
    // afterwards because they're best-effort.
    await prisma.$transaction(async (tx) => {
      if (parsed.data.onlinePaymentsEnabled !== undefined &&
          parsed.data.onlinePaymentsEnabled !== before.onlinePaymentsEnabled) {
        await tx.systemConfig.upsert({
          where: { key: "onlinePaymentsEnabled" },
          update: { value: parsed.data.onlinePaymentsEnabled },
          create: { key: "onlinePaymentsEnabled", value: parsed.data.onlinePaymentsEnabled },
        });
        changed.onlinePaymentsEnabled = {
          before: before.onlinePaymentsEnabled,
          after: parsed.data.onlinePaymentsEnabled,
        };
        await createAdminAuditLog({
          tx,
          adminUserId: auth.user.id,
          action: "SETTINGS_FLAG_TOGGLED",
          targetType: "system_config",
          targetId: "onlinePaymentsEnabled",
          details: {
            key: "onlinePaymentsEnabled",
            value: parsed.data.onlinePaymentsEnabled,
            prevValue: before.onlinePaymentsEnabled,
          },
          context: auditContext,
        });
      }

      if (parsed.data.visualSearchEnabled !== undefined &&
          parsed.data.visualSearchEnabled !== before.visualSearchEnabled) {
        await tx.systemConfig.upsert({
          where: { key: "visualSearchEnabled" },
          update: { value: parsed.data.visualSearchEnabled },
          create: { key: "visualSearchEnabled", value: parsed.data.visualSearchEnabled },
        });
        changed.visualSearchEnabled = {
          before: before.visualSearchEnabled,
          after: parsed.data.visualSearchEnabled,
        };
        await createAdminAuditLog({
          tx,
          adminUserId: auth.user.id,
          action: "SETTINGS_FLAG_TOGGLED",
          targetType: "system_config",
          targetId: "visualSearchEnabled",
          details: {
            key: "visualSearchEnabled",
            value: parsed.data.visualSearchEnabled,
            prevValue: before.visualSearchEnabled,
          },
          context: auditContext,
        });
      }

      if (parsed.data.legalDraftMode !== undefined &&
          parsed.data.legalDraftMode !== before.legalDraftMode) {
        await tx.systemConfig.upsert({
          where: { key: "legalDraftMode" },
          update: { value: parsed.data.legalDraftMode },
          create: { key: "legalDraftMode", value: parsed.data.legalDraftMode },
        });
        changed.legalDraftMode = {
          before: before.legalDraftMode,
          after: parsed.data.legalDraftMode,
        };
        await createAdminAuditLog({
          tx,
          adminUserId: auth.user.id,
          action: "SETTINGS_FLAG_TOGGLED",
          targetType: "system_config",
          targetId: "legalDraftMode",
          details: {
            key: "legalDraftMode",
            value: parsed.data.legalDraftMode,
            prevValue: before.legalDraftMode,
          },
          context: auditContext,
        });
      }
    });

    if (changed.visualSearchEnabled) {
      await clearVisualSearchEnabledCache();
    }
    if (changed.legalDraftMode) {
      await clearLegalDraftModeCache();
    }

    if (Object.keys(changed).length > 0) {
      logInfo("admin.settings.flags.updated", {
        adminUserId: auth.user.id,
        changed,
      });
    }

    const flags = await readAllFlags();
    return ok(flags);
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
