import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { formatZodError } from "@/lib/api/validation";
import { ProviderType } from "@prisma/client";

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

    const provider = await prisma.provider.findUnique({
      where: { id },
      select: { id: true, type: true },
    });

    if (!provider) {
      return fail("Provider not found", 404, "PROVIDER_NOT_FOUND");
    }

    if (provider.type === ProviderType.MASTER) {
      const master = await prisma.provider.findUnique({
        where: { id },
        select: { id: true, name: true, publicUsername: true },
      });
      return ok({ masters: master ? [master] : [] });
    }

    const masters = await prisma.provider.findMany({
      where: { studioId: id, type: ProviderType.MASTER },
      select: { id: true, name: true, publicUsername: true },
      orderBy: { createdAt: "asc" },
    });

    return ok({ masters });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("GET /api/providers/[id]/masters failed:", detail);
    return fail("Internal error", 500, "INTERNAL_ERROR");
  }
}
