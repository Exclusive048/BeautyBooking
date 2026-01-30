import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";

export type MasterProfileUpdate = {
  address?: string;
};

export async function updateStudioMasterProfile(
  studioProviderId: string,
  masterProviderId: string,
  input: MasterProfileUpdate
): Promise<Result<{ address: string }>> {
  const master = await prisma.provider.findUnique({
    where: { id: masterProviderId },
    select: { id: true, type: true, studioId: true },
  });

  if (
    !master ||
    master.type !== ProviderType.MASTER ||
    master.studioId !== studioProviderId
  ) {
    return { ok: false, status: 404, message: "Master not found", code: "MASTER_NOT_FOUND" };
  }

  const updated = await prisma.provider.update({
    where: { id: masterProviderId },
    data: { address: input.address },
    select: { address: true },
  });

  return { ok: true, data: { address: updated.address } };
}
