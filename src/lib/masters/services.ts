import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";
import { personalMasterProviderWhere } from "@/lib/master/access";

export async function resolveGlobalMasterProvider(userId: string): Promise<Result<{ id: string }>> {
  const provider = await prisma.provider.findFirst({
    // STUDIO-MASTER-PROFILES: личный профиль — через `MasterProfile`, а не
    // «любой профиль без студии» (им мог оказаться профиль, оставшийся после
    // ухода из студии).
    where: { ...personalMasterProviderWhere(userId), studioId: null },
    select: { id: true },
  });

  if (!provider) {
    return {
      ok: false,
      status: 404,
      message: "Профиль мастера не найден.",
      code: "MASTER_PROFILE_NOT_FOUND",
    };
  }

  return { ok: true, data: provider };
}
