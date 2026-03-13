import { ok, fail } from "@/lib/api/response";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { formatZodError } from "@/lib/api/validation";
import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";
import { logError } from "@/lib/logging/logger";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const params = await ctx.params;
    const parsed = providerIdParamSchema.safeParse(params);
    if (!parsed.success) {
      return fail(formatZodError(parsed.error), 400, "VALIDATION_ERROR");
    }
    const { id } = parsed.data;

    const provider = await resolveProviderBySlugOrId({
      key: id,
      select: { id: true, type: true, name: true, publicUsername: true, isPublished: true },
    });

    if (!provider || !provider.isPublished) {
      return fail("Provider not found", 404, "PROVIDER_NOT_FOUND");
    }

    if (provider.type === ProviderType.MASTER) {
      return ok({ masters: [{ id: provider.id, name: provider.name, publicUsername: provider.publicUsername }] });
    }

    const masters = await prisma.provider.findMany({
      where: { studioId: provider.id, type: ProviderType.MASTER, isPublished: true },
      select: { id: true, name: true, publicUsername: true },
      orderBy: { createdAt: "asc" },
    });

    return ok({ masters });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    logError("GET /api/providers/[id]/masters failed", { error: detail });
    return fail("Internal error", 500, "INTERNAL_ERROR");
  }
}
