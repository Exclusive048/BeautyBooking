import type { Prisma } from "@prisma/client";
import { AccountType } from "@prisma/client";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSessionToken } from "@/lib/auth/jwt";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { ensureFreeSubscriptionsForRoles } from "@/lib/billing/ensure-free-subscription";
import { fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { exchangeVkCodeForToken, fetchVkProfile, requireVkRedirectUri } from "@/lib/vk/oauth";
import { readSignedVkCookieValue, VK_ID_STATE_COOKIE, VK_ID_VERIFIER_COOKIE } from "@/lib/vk/cookies";
import { nextRedirect } from "@/lib/http/origin";
import { logError } from "@/lib/logging/logger";

const callbackSchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
  device_id: z.string().trim().min(1),
  // VK может прислать type=code_v2, но нам он не обязателен
  type: z.string().trim().optional(),
});

function clearVkCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.set(VK_ID_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  cookieStore.set(VK_ID_VERIFIER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function buildDisplayName(firstName?: string | null, lastName?: string | null) {
  const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return fullName || null;
}

async function upsertVkLink(params: {
  userId: string;
  vkUserId: string;
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}) {
  const existing = await prisma.vkLink.findUnique({
    where: { vkUserId: params.vkUserId },
    select: { userId: true },
  });

  if (existing && existing.userId !== params.userId) {
    throw new AppError("VK уже привязан к другому пользователю", 409, "VK_ALREADY_LINKED");
  }

  await prisma.vkLink.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      vkUserId: params.vkUserId,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      deviceId: params.deviceId,
      isEnabled: true,
    },
    update: {
      vkUserId: params.vkUserId,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      deviceId: params.deviceId,
      isEnabled: true,
    },
  });
}

function parseVkCallback(url: URL): z.infer<typeof callbackSchema> {
  const sp = url.searchParams;

  const payloadRaw = sp.get("payload");
  if (payloadRaw) {
    let payloadValue: unknown;

    // payload может приходить как JSON-строка или urlencoded JSON-строка
    try {
      payloadValue = JSON.parse(payloadRaw);
    } catch {
      try {
        payloadValue = JSON.parse(decodeURIComponent(payloadRaw));
      } catch {
        throw new AppError("VK payload is invalid", 400, "VALIDATION_ERROR");
      }
    }

    const parsed = callbackSchema.safeParse(payloadValue);
    if (!parsed.success) {
      throw new AppError("VK payload is invalid", 400, "VALIDATION_ERROR");
    }

    return parsed.data;
  }

  // fallback: VK ID часто возвращает параметры прямо в query (?code=...&device_id=...&state=...&type=code_v2)
  const directValue = {
    code: sp.get("code"),
    state: sp.get("state"),
    device_id: sp.get("device_id"),
    type: sp.get("type") ?? undefined,
  };

  const parsed = callbackSchema.safeParse(directValue);
  if (!parsed.success) {
    throw new AppError("VK callback is missing required params", 400, "VALIDATION_ERROR");
  }

  return parsed.data;
}

export async function GET(req: Request) {
  const cookieStore = await cookies();

  try {
    const url = new URL(req.url);

    const parsedCallback = parseVkCallback(url);

    const expectedState = readSignedVkCookieValue(cookieStore.get(VK_ID_STATE_COOKIE)?.value);
    const codeVerifier = readSignedVkCookieValue(cookieStore.get(VK_ID_VERIFIER_COOKIE)?.value);

    // чистим в любом случае (успех/ошибка), чтобы не держать мусор
    clearVkCookies(cookieStore);

    if (!expectedState || parsedCallback.state !== expectedState) {
      return fail("Invalid state", 400, "VK_STATE_INVALID");
    }
    if (!codeVerifier) {
      return fail("VK code verifier is missing", 400, "VALIDATION_ERROR");
    }

    const redirectUri = requireVkRedirectUri("auth");
    const token = await exchangeVkCodeForToken({
      code: parsedCallback.code,
      codeVerifier,
      deviceId: parsedCallback.device_id,
      redirectUri,
      state: parsedCallback.state,
    });

    const profile = await fetchVkProfile(token.accessToken);
    const vkUserId = profile.id;

    const sessionUser = await getSessionUser();

    // 1) Если юзер уже залогинен — это "подключение VK" к текущему аккаунту
    if (sessionUser) {
      await upsertVkLink({
        userId: sessionUser.id,
        vkUserId,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        deviceId: token.deviceId,
      });
      try {
        await ensureFreeSubscriptionsForRoles(sessionUser.id, sessionUser.roles);
      } catch (error) {
        logError("ensureFreeSubscriptionsForRoles failed after vk link", {
          userProfileId: sessionUser.id,
          error: error instanceof Error ? error.stack : error,
        });
      }

      const redirectDecision = await resolveCabinetRedirect(sessionUser.id);
      return nextRedirect(req, redirectDecision.target);
    }

    // 2) Иначе — это вход / регистрация по VK
    const link = await prisma.vkLink.findUnique({
      where: { vkUserId },
      select: { userId: true },
    });

    let user = link
      ? await prisma.userProfile.findUnique({
          where: { id: link.userId },
        })
      : null;

    if (!user && link) {
      throw new AppError("VK уже привязан к другому пользователю", 409, "VK_ALREADY_LINKED");
    }

    if (!user) {
      user = await prisma.userProfile.create({
        data: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          displayName: buildDisplayName(profile.firstName, profile.lastName),
          phone: profile.phone ?? undefined,
          email: profile.email ?? undefined,
          externalPhotoUrl: profile.avatarUrl ?? undefined,
          roles: [AccountType.CLIENT],
        },
      });
    } else {
      const updateData: Prisma.UserProfileUpdateInput = {};
      if (!user.firstName && profile.firstName) updateData.firstName = profile.firstName;
      if (!user.lastName && profile.lastName) updateData.lastName = profile.lastName;
      if (!user.displayName) {
        const displayName = buildDisplayName(profile.firstName, profile.lastName);
        if (displayName) updateData.displayName = displayName;
      }
      if (!user.phone && profile.phone) updateData.phone = profile.phone;
      if (!user.email && profile.email) updateData.email = profile.email;
      if (profile.avatarUrl && profile.avatarUrl !== user.externalPhotoUrl) {
        updateData.externalPhotoUrl = profile.avatarUrl;
      }

      if (Object.keys(updateData).length > 0) {
        user = await prisma.userProfile.update({
          where: { id: user.id },
          data: updateData,
        });
      }

      const nextRoles = await ensureClientRoleForUser(user.id, user.roles);
      if (nextRoles !== user.roles) {
        user = { ...user, roles: nextRoles };
      }
    }

    try {
      await ensureFreeSubscriptionsForRoles(user.id, user.roles);
    } catch (error) {
      logError("ensureFreeSubscriptionsForRoles failed after vk auth", {
        userProfileId: user.id,
        error: error instanceof Error ? error.stack : error,
      });
    }

    await upsertVkLink({
      userId: user.id,
      vkUserId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      deviceId: token.deviceId,
    });

    const tokenValue = createSessionToken(
      { sub: user.id, phone: user.phone ?? null, roles: user.roles },
      60 * 60 * 24 * 30
    );

    const cookieName = process.env.AUTH_COOKIE_NAME ?? "bh_session";
    cookieStore.set(cookieName, tokenValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    const redirectDecision = await resolveCabinetRedirect(user.id);
    return nextRedirect(req, redirectDecision.target);
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
