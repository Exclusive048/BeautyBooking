import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";
import { clearVisualSearchEnabledCache } from "@/lib/visual-search/config";

const updateSchema = z.object({
  onlinePaymentsEnabled: z.boolean().optional(),
  visualSearchEnabled: z.boolean().optional(),
}).refine((value) => value.onlinePaymentsEnabled !== undefined || value.visualSearchEnabled !== undefined, {
  message: "At least one setting is required",
});

function parseFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const [onlinePayments, visualSearch] = await Promise.all([
    prisma.systemConfig.findUnique({
      where: { key: "onlinePaymentsEnabled" },
      select: { value: true },
    }),
    prisma.systemConfig.findUnique({
      where: { key: "visualSearchEnabled" },
      select: { value: true },
    }),
  ]);

  return ok({
    onlinePaymentsEnabled: parseFlag(onlinePayments?.value, false),
    visualSearchEnabled: parseFlag(visualSearch?.value, false),
  });
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

    if (parsed.data.onlinePaymentsEnabled !== undefined) {
      await prisma.systemConfig.upsert({
        where: { key: "onlinePaymentsEnabled" },
        update: { value: parsed.data.onlinePaymentsEnabled },
        create: { key: "onlinePaymentsEnabled", value: parsed.data.onlinePaymentsEnabled },
      });
    }

    if (parsed.data.visualSearchEnabled !== undefined) {
      await prisma.systemConfig.upsert({
        where: { key: "visualSearchEnabled" },
        update: { value: parsed.data.visualSearchEnabled },
        create: { key: "visualSearchEnabled", value: parsed.data.visualSearchEnabled },
      });
      await clearVisualSearchEnabledCache();
    }

    const [onlinePayments, visualSearch] = await Promise.all([
      prisma.systemConfig.findUnique({
        where: { key: "onlinePaymentsEnabled" },
        select: { value: true },
      }),
      prisma.systemConfig.findUnique({
        where: { key: "visualSearchEnabled" },
        select: { value: true },
      }),
    ]);

    return ok({
      onlinePaymentsEnabled: parseFlag(onlinePayments?.value, false),
      visualSearchEnabled: parseFlag(visualSearch?.value, false),
    });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
