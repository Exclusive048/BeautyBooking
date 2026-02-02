import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export async function getCurrentMasterProviderId(userId: string): Promise<string> {
  const provider = await prisma.provider.findFirst({
    where: {
      ownerUserId: userId,
      type: "MASTER",
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (!provider) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  return provider.id;
}

