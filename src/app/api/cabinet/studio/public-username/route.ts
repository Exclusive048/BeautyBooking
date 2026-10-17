import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { resolvePublicAppUrl } from "@/lib/app-url";
import {
  ensureUniqueUsername,
  generateDefaultUsername,
  isUsernameTaken,
  normalizeUsernameInput,
  validateUsername,
} from "@/lib/publicUsername";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { parseBody } from "@/lib/validation";
import { ProviderType } from "@prisma/client";

export const runtime = "nodejs";

const bodySchema = z.object({
  username: z.string().trim().min(1),
});

function buildPublicUrl(appUrl: string, username: string) {
  return `${appUrl}/u/${username}`;
}

/**
 * Студия — та же, что у страницы «Моя страница» и всего кабинета
 * (`resolveCurrentStudioAccess`: OWNER > ADMIN > MASTER); править адрес может
 * владелец и администратор (как профиль студии, `PATCH /api/studios/[id]`),
 * мастеру студии — 403. Раньше студия искалась по `ownerUserId`, и
 * администратор получал 404 «Профиль студии не найден.».
 */
async function resolveStudioProviderId(userId: string): Promise<string> {
  const access = await requireStudioCabinetAdmin(userId);
  return access.providerId;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const appUrl = resolvePublicAppUrl(req.url);
    if (!appUrl) {
      throw new AppError("Не удалось собрать ссылку на профиль. Попробуйте ещё раз.", 500, "APP_PUBLIC_URL_MISSING");
    }

    const provider = await prisma.provider.findFirst({
      where: { id: await resolveStudioProviderId(auth.user.id), type: ProviderType.STUDIO },
      select: { id: true, name: true, publicUsername: true },
    });
    if (!provider) {
      return jsonFail(404, "Профиль студии не найден.", "PROVIDER_NOT_FOUND");
    }

    let username = provider.publicUsername;
    if (!username) {
      const baseUsername = generateDefaultUsername({
        providerType: ProviderType.STUDIO,
        studioName: provider.name,
      });
      username = await ensureUniqueUsername(prisma, baseUsername);
      const updated = await prisma.provider.update({
        where: { id: provider.id },
        data: { publicUsername: username, publicUsernameUpdatedAt: new Date() },
        select: { publicUsername: true },
      });
      username = updated.publicUsername ?? username;
    }

    return jsonOk({ username, url: buildPublicUrl(appUrl, username) });
  } catch (error) {
    const appError = toAppError(error);
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const appUrl = resolvePublicAppUrl(req.url);
    if (!appUrl) {
      throw new AppError("Не удалось собрать ссылку на профиль. Попробуйте ещё раз.", 500, "APP_PUBLIC_URL_MISSING");
    }

    const body = await parseBody(req, bodySchema);
    const normalized = normalizeUsernameInput(body.username);
    const validation = validateUsername(normalized);
    if (!validation.ok) {
      return jsonFail(400, validation.reason, "VALIDATION_ERROR");
    }

    const provider = await prisma.provider.findFirst({
      where: { id: await resolveStudioProviderId(auth.user.id), type: ProviderType.STUDIO },
      select: { id: true, publicUsername: true },
    });
    if (!provider) {
      return jsonFail(404, "Профиль студии не найден.", "PROVIDER_NOT_FOUND");
    }

    if (provider.publicUsername === normalized) {
      return jsonOk({ username: normalized, url: buildPublicUrl(appUrl, normalized) });
    }

    if (await isUsernameTaken(prisma, normalized)) {
      return jsonFail(409, "Этот адрес профиля уже занят. Придумайте другой.", "CONFLICT");
    }

    const current = await prisma.provider.findUnique({
      where: { id: provider.id },
      select: { publicUsername: true },
    });
    if (!current) {
      throw new AppError("Профиль не найден.", 404, "PROVIDER_NOT_FOUND");
    }

    if (current.publicUsername && current.publicUsername !== normalized) {
      const exists = await prisma.publicUsernameAlias.findUnique({
        where: { username: current.publicUsername },
        select: { id: true },
      });
      if (!exists) {
        await prisma.publicUsernameAlias.create({
          data: { username: current.publicUsername, providerId: provider.id },
          select: { id: true },
        });
      }
    }

    await prisma.provider.update({
      where: { id: provider.id },
      data: { publicUsername: normalized, publicUsernameUpdatedAt: new Date() },
      select: { id: true },
    });

    const aliases = await prisma.publicUsernameAlias.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (aliases.length > 10) {
      const keepIds = new Set(aliases.slice(0, 10).map((alias) => alias.id));
      await prisma.publicUsernameAlias.deleteMany({
        where: { providerId: provider.id, id: { notIn: Array.from(keepIds) } },
      });
    }

    return jsonOk({ username: normalized, url: buildPublicUrl(appUrl, normalized) });
  } catch (error) {
    const appError = toAppError(error);
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
