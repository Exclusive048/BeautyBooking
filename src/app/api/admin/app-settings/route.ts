import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";

const patchSchema = z.object({
  key: z.string().trim().min(1).max(120),
  value: z.string().trim().max(2000),
});

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const settings = await prisma.appSetting.findMany({
      orderBy: { key: "asc" },
      select: { key: true, value: true, updatedAt: true },
    });

    return ok({
      settings: settings.map((s) => ({
        key: s.key,
        value: s.value,
        updatedAt: s.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return fail("Неверные данные.", 400, "VALIDATION_ERROR");
    }

    const { key, value } = parsed.data;

    const before = await prisma.appSetting.findUnique({
      where: { key },
      select: { value: true },
    });

    const setting = await prisma.$transaction(async (tx) => {
      const row = await tx.appSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
        select: { key: true, value: true, updatedAt: true },
      });

      if (before?.value !== value) {
        await createAdminAuditLog({
          tx,
          adminUserId: auth.user.id,
          action: "SETTINGS_APP_SETTING_UPDATED",
          targetType: "app_setting",
          targetId: key,
          details: { key, before: before?.value ?? null, after: value },
          context: getAdminAuditContext(req),
        });
      }

      return row;
    });

    return ok({
      setting: {
        key: setting.key,
        value: setting.value,
        updatedAt: setting.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
