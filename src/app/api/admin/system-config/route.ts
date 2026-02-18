import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { requireAdminAuth } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { AppError, toAppError } from "@/lib/api/errors";
import { formatZodError } from "@/lib/api/validation";

const updateSchema = z.object({
  onlinePaymentsEnabled: z.boolean(),
});

function parseFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function GET() {
  const auth = await requireAdminAuth();
  if (!auth.ok) return auth.response;

  const record = await prisma.systemConfig.findUnique({
    where: { key: "onlinePaymentsEnabled" },
    select: { value: true },
  });

  return ok({ onlinePaymentsEnabled: parseFlag(record?.value, false) });
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

    const updated = await prisma.systemConfig.upsert({
      where: { key: "onlinePaymentsEnabled" },
      update: { value: parsed.data.onlinePaymentsEnabled },
      create: { key: "onlinePaymentsEnabled", value: parsed.data.onlinePaymentsEnabled },
      select: { value: true },
    });

    return ok({ onlinePaymentsEnabled: parseFlag(updated.value, false) });
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
