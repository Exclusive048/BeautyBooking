import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { resolvePublicAppUrl } from "@/lib/app-url";
import {
  ensureUniqueUsername,
  generateDefaultUsername,
  isUsernameTaken,
  normalizeUsernameInput,
  validateUsername,
} from "@/lib/publicUsername";
import { providerPublicUrl } from "@/lib/public-urls";
import { parseBody } from "@/lib/validation";
import { ProviderType } from "@prisma/client";

export const runtime = "nodejs";

const bodySchema = z.object({
  username: z.string().trim().min(1),
});

function buildPublicUrl(appUrl: string, providerId: string, username: string) {
  return `${appUrl}${providerPublicUrl({ id: providerId, publicUsername: username }, "master-public-username")}`;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const appUrl = resolvePublicAppUrl(req.url);
    if (!appUrl) {
      throw new AppError("APP_PUBLIC_URL is not configured", 500, "APP_PUBLIC_URL_MISSING");
    }

    const providerId = await getCurrentMasterProviderId(auth.user.id);
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { publicUsername: true, categories: true },
    });
    if (!provider) {
      return jsonFail(404, "Профиль мастера не найден.", "PROVIDER_NOT_FOUND");
    }

    let username = provider.publicUsername;
    if (!username) {
      const owner = await prisma.userProfile.findUnique({
        where: { id: auth.user.id },
        select: { firstName: true, lastName: true },
      });
      const baseUsername = generateDefaultUsername({
        providerType: ProviderType.MASTER,
        firstName: owner?.firstName ?? null,
        lastName: owner?.lastName ?? null,
        allowLastName: false,
        serviceCategory: provider.categories[0] ?? null,
      });
      username = await ensureUniqueUsername(prisma, baseUsername);
      const updated = await prisma.provider.update({
        where: { id: providerId },
        data: { publicUsername: username, publicUsernameUpdatedAt: new Date() },
        select: { publicUsername: true },
      });
      username = updated.publicUsername ?? username;
    }

    return jsonOk({ username, url: buildPublicUrl(appUrl, providerId, username) });
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
      throw new AppError("APP_PUBLIC_URL is not configured", 500, "APP_PUBLIC_URL_MISSING");
    }

    const body = await parseBody(req, bodySchema);
    const normalized = normalizeUsernameInput(body.username);
    const validation = validateUsername(normalized);
    if (!validation.ok) {
      return jsonFail(400, validation.reason, "VALIDATION_ERROR");
    }

    const providerId = await getCurrentMasterProviderId(auth.user.id);
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { publicUsername: true },
    });
    if (!provider) {
      return jsonFail(404, "Профиль мастера не найден.", "PROVIDER_NOT_FOUND");
    }

    if (provider.publicUsername === normalized) {
      return jsonOk({ username: normalized, url: buildPublicUrl(appUrl, providerId, normalized) });
    }

    if (await isUsernameTaken(prisma, normalized)) {
      return jsonFail(409, "Этот username уже занят. Попробуйте другой.", "CONFLICT");
    }

    const current = await prisma.provider.findUnique({
      where: { id: providerId },
      select: { publicUsername: true },
    });
    if (!current) {
      throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");
    }

    if (current.publicUsername && current.publicUsername !== normalized) {
      const exists = await prisma.publicUsernameAlias.findUnique({
        where: { username: current.publicUsername },
        select: { id: true },
      });
      if (!exists) {
        await prisma.publicUsernameAlias.create({
          data: { username: current.publicUsername, providerId },
          select: { id: true },
        });
      }
    }

    await prisma.provider.update({
      where: { id: providerId },
      data: { publicUsername: normalized, publicUsernameUpdatedAt: new Date() },
      select: { id: true },
    });

    const aliases = await prisma.publicUsernameAlias.findMany({
      where: { providerId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (aliases.length > 10) {
      const keepIds = new Set(aliases.slice(0, 10).map((alias) => alias.id));
      await prisma.publicUsernameAlias.deleteMany({
        where: { providerId, id: { notIn: Array.from(keepIds) } },
      });
    }

    return jsonOk({ username: normalized, url: buildPublicUrl(appUrl, providerId, normalized) });
  } catch (error) {
    const appError = toAppError(error);
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
