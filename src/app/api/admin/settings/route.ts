import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { logInfo } from "@/lib/logging/logger";

const SETTINGS_KEYS = {
  seoTitle: "siteSeoTitle",
  seoDescription: "siteSeoDescription",
} as const;

const patchSchema = z.object({
  seoTitle: z.string().trim().max(120).optional().nullable(),
  seoDescription: z.string().trim().max(240).optional().nullable(),
});

async function readSetting(key: string): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  return setting?.value ?? null;
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function writeSettingTx(tx: TxClient, key: string, value: string | null) {
  if (value == null || value.trim().length === 0) {
    await tx.appSetting.deleteMany({ where: { key } });
    return;
  }

  await tx.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const [seoTitle, seoDescription] = await Promise.all([
    readSetting(SETTINGS_KEYS.seoTitle),
    readSetting(SETTINGS_KEYS.seoDescription),
  ]);

  return ok({
    seoTitle,
    seoDescription,
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }

    const seoTitle = parsed.data.seoTitle ?? null;
    const seoDescription = parsed.data.seoDescription ?? null;

    const [prevTitle, prevDescription] = await Promise.all([
      readSetting(SETTINGS_KEYS.seoTitle),
      readSetting(SETTINGS_KEYS.seoDescription),
    ]);

    // Build the diff up-front so both the AdminAuditLog row and the
    // structured log emit identical shapes. Settings writes happen
    // inside the same transaction as the audit so a failed audit
    // rolls the SEO update back.
    const changed: Record<string, { before: string | null; after: string | null }> = {};
    if (prevTitle !== seoTitle) {
      changed.seoTitle = { before: prevTitle, after: seoTitle };
    }
    if (prevDescription !== seoDescription) {
      changed.seoDescription = { before: prevDescription, after: seoDescription };
    }

    await prisma.$transaction(async (tx) => {
      await writeSettingTx(tx, SETTINGS_KEYS.seoTitle, seoTitle);
      await writeSettingTx(tx, SETTINGS_KEYS.seoDescription, seoDescription);

      if (Object.keys(changed).length > 0) {
        await createAdminAuditLog({
          tx,
          adminUserId: auth.user.id,
          action: "SETTINGS_SEO_UPDATED",
          targetType: "app_setting",
          targetId: "seo",
          details: { changes: changed },
          context: getAdminAuditContext(req),
        });
      }
    });

    if (Object.keys(changed).length > 0) {
      logInfo("admin.settings.seo.updated", {
        adminUserId: auth.user.id,
        changed,
      });
    }

    return ok({ seoTitle, seoDescription });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
