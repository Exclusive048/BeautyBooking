import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api/response";
import { formatZodError } from "@/lib/api/validation";
import { providerIdParamSchema } from "@/lib/providers/schemas";
import { mapProviderProfile } from "@/lib/providers/mappers";

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
      include: {
        services: {
          where: { isEnabled: true },
          select: {
            id: true,
            name: true,
            durationMin: true,
            price: true,
          },
        },
      },
    });

    if (!provider) {
      return fail("Provider not found", 404, "PROVIDER_NOT_FOUND");
    }

    return ok({ provider: mapProviderProfile(provider) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("GET /api/providers/[id] failed:", detail);
    return fail("Internal error", 500, "INTERNAL_ERROR");
  }
}
