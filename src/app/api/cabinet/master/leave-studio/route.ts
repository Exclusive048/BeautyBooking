import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/guards";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { transferMasterOutOfStudio } from "@/lib/studio/transfer-master";
import { parseBody } from "@/lib/validation";

export const runtime = "nodejs";

const bodySchema = z.object({
  transferServices: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const body = await parseBody(req, bodySchema);
    const masterId = await getCurrentMasterProviderId(auth.user.id);
    const master = await prisma.provider.findUnique({
      where: { id: masterId },
      select: { studioId: true },
    });
    if (!master?.studioId) {
      return jsonFail(409, "Master is not in studio", "CONFLICT");
    }

    const result = await transferMasterOutOfStudio(masterId, master.studioId, body.transferServices);
    return jsonOk({ transferredServices: result.transferredServices });
  } catch (error) {
    const appError = toAppError(error);
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

