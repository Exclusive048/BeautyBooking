import { ProviderType, StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { fail, ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { resolveCatalogPresence } from "@/lib/providers/catalog-presence";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

/**
 * VISIBILITY-CATALOG-STATUS (2026-09-23) — есть ли СВОЙ кабинет (мастера или
 * студии) в каталоге и чего не хватает. Отдельный лёгкий вход, потому что
 * статус меняется от правок на тех же экранах (видимость, адрес, рабочие дни),
 * а экраны сохраняют автосейвом без перезагрузки страницы.
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const type = new URL(req.url).searchParams.get("type") === "studio" ? ProviderType.STUDIO : ProviderType.MASTER;
  const providerId =
    type === ProviderType.STUDIO
      ? await resolveAdministeredStudioProviderId(auth.user.id)
      : (
          await prisma.provider.findFirst({
            where: { ownerUserId: auth.user.id, type },
            select: { id: true },
            orderBy: { createdAt: "asc" },
          })
        )?.id ?? null;
  if (!providerId) return fail("Кабинет не найден.", 404, "PROVIDER_NOT_FOUND");

  const presence = await resolveCatalogPresence(providerId);
  if (!presence) return fail("Кабинет не найден.", 404, "PROVIDER_NOT_FOUND");
  return ok(presence);
}

/**
 * Студия — та, что открыта в кабинете (`resolveCurrentStudioAccess`, как у
 * шелла), а не «первая, которой пользователь владеет»: администратор, не
 * являющийся владельцем, иначе получал 404, а владелец одной студии и админ
 * другой видел на её экране статус чужой.
 */
async function resolveAdministeredStudioProviderId(userId: string): Promise<string | null> {
  try {
    const access = await resolveCurrentStudioAccess(userId);
    const administers = access.roles.includes(StudioRole.OWNER) || access.roles.includes(StudioRole.ADMIN);
    return administers ? access.providerId : null;
  } catch (error) {
    // Нет ни одной студии в кабинете — «кабинета нет», прочее (сбой БД) — наверх.
    if (error instanceof AppError && error.status === 403) return null;
    throw error;
  }
}
