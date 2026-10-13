import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { logInfo } from "@/lib/logging/logger";
import { rejectForbiddenWords } from "@/lib/moderation/zod";
import { SITE_SEO_KEYS, invalidateSiteSeoCache, readStoredSiteSeo } from "@/lib/seo/site-seo";
import {
  SITE_SEO_DESCRIPTION_MAX,
  SITE_SEO_TITLE_MAX,
  normalizeSiteSeoText,
} from "@/lib/seo/site-seo-shared";
import { parseBody } from "@/lib/validation";

// SEO-ADMIN-01: текст уходит на главную сайта — пределы выдачи поисковиков и
// проверка слов, как у любого публичного поля.
const seoField = (max: number) =>
  z
    .string()
    .transform(normalizeSiteSeoText)
    .pipe(z.string().max(max).superRefine(rejectForbiddenWords("text")))
    .optional()
    .nullable();

const patchSchema = z.object({
  seoTitle: seoField(SITE_SEO_TITLE_MAX),
  seoDescription: seoField(SITE_SEO_DESCRIPTION_MAX),
});

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function writeSettingTx(tx: TxClient, key: string, value: string | null) {
  if (value == null || value.length === 0) {
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

  const stored = await readStoredSiteSeo();
  return ok({
    seoTitle: stored.title,
    seoDescription: stored.description,
  });
}

export async function PATCH(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await parseBody(req, patchSchema);
    const seoTitle = body.seoTitle || null;
    const seoDescription = body.seoDescription || null;

    const prev = await readStoredSiteSeo();

    // Build the diff up-front so both the AdminAuditLog row and the
    // structured log emit identical shapes. Settings writes happen
    // inside the same transaction as the audit so a failed audit
    // rolls the SEO update back.
    const changed: Record<string, { before: string | null; after: string | null }> = {};
    if (prev.title !== seoTitle) {
      changed.seoTitle = { before: prev.title, after: seoTitle };
    }
    if (prev.description !== seoDescription) {
      changed.seoDescription = { before: prev.description, after: seoDescription };
    }

    await prisma.$transaction(async (tx) => {
      await writeSettingTx(tx, SITE_SEO_KEYS.title, seoTitle);
      await writeSettingTx(tx, SITE_SEO_KEYS.description, seoDescription);

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

    // Главная и разметка читают настройки через общий кэш — без сброса новый
    // текст появился бы на сайте только через срок кэша. Сбрасывается и без
    // изменений: сохранение — способ показать на сайте то, что в базе.
    await invalidateSiteSeoCache();

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
