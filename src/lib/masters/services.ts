import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";

export async function resolveGlobalMasterProvider(userId: string): Promise<Result<{ id: string }>> {
  const provider = await prisma.provider.findFirst({
    where: { ownerUserId: userId, type: ProviderType.MASTER, studioId: null },
    select: { id: true },
  });

  if (!provider) {
    return {
      ok: false,
      status: 404,
      message: "Master profile not found",
      code: "MASTER_PROFILE_NOT_FOUND",
    };
  }

  return { ok: true, data: provider };
}
