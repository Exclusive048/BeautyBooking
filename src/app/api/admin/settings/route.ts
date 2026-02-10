import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";

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

async function writeSetting(key: string, value: string | null) {
  if (value == null || value.trim().length === 0) {
    await prisma.appSetting.deleteMany({ where: { key } });
    return;
  }

  await prisma.appSetting.upsert({
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

    await Promise.all([
      writeSetting(SETTINGS_KEYS.seoTitle, seoTitle),
      writeSetting(SETTINGS_KEYS.seoDescription, seoDescription),
    ]);

    return ok({ seoTitle, seoDescription });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
