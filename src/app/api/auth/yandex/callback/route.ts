import type { Prisma } from "@prisma/client";
import { AccountType } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { withRequestContext } from "@/lib/api/with-request-context";
import { AppError, toAppError } from "@/lib/api/errors";
import { fail } from "@/lib/api/response";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { getSessionUser, setSessionCookies } from "@/lib/auth/session";
import { ensureFreeSubscriptionsForRoles } from "@/lib/billing/ensure-free-subscription";
import { nextRedirect } from "@/lib/http/origin";
import { logError } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { exchangeYandexCodeForToken, fetchYandexProfile, requireYandexRedirectUri } from "@/lib/yandex/oauth";
import { yandexCallbackSchema } from "@/lib/yandex/schemas";
import {
  readSignedYandexCookieValue,
  YANDEX_STATE_COOKIE,
  YANDEX_VERIFIER_COOKIE,
} from "@/lib/yandex/cookies";
import { isProduction } from "@/lib/env";

// FIX-YANDEX-OAUTH — callback route. Account-linking logic mirrors
// api/auth/vk/callback EXACTLY (the security-sensitive new-vs-existing-user
// branch + the "already linked to another user" 409 guard).

function clearYandexCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.set(YANDEX_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });
  cookieStore.set(YANDEX_VERIFIER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });
}

function buildDisplayName(firstName?: string | null, lastName?: string | null) {
  const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return fullName || null;
}

async function upsertYandexLink(params: {
  userId: string;
  yandexUserId: string;
  accessToken: string;
  refreshToken: string;
}) {
  const existing = await prisma.yandexLink.findUnique({
    where: { yandexUserId: params.yandexUserId },
    select: { userId: true },
  });

  if (existing && existing.userId !== params.userId) {
    throw new AppError("Yandex already linked to another user", 409, "YANDEX_ALREADY_LINKED");
  }

  await prisma.yandexLink.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      yandexUserId: params.yandexUserId,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      isEnabled: true,
    },
    update: {
      yandexUserId: params.yandexUserId,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      isEnabled: true,
    },
  });
}

export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    const cookieStore = await cookies();

    try {
      const url = new URL(req.url);
      const parsed = yandexCallbackSchema.safeParse({
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
      });
      if (!parsed.success) {
        clearYandexCookies(cookieStore);
        return fail("Yandex callback is missing required params", 400, "VALIDATION_ERROR");
      }
      const parsedCallback = parsed.data;

      const expectedState = readSignedYandexCookieValue(cookieStore.get(YANDEX_STATE_COOKIE)?.value);
      const codeVerifier = readSignedYandexCookieValue(cookieStore.get(YANDEX_VERIFIER_COOKIE)?.value);

      clearYandexCookies(cookieStore);

      if (!expectedState || parsedCallback.state !== expectedState) {
        return fail("Invalid state", 400, "YANDEX_STATE_INVALID");
      }
      if (!codeVerifier) {
        return fail("Yandex code verifier is missing", 400, "VALIDATION_ERROR");
      }

      const redirectUri = requireYandexRedirectUri();
      const token = await exchangeYandexCodeForToken({
        code: parsedCallback.code,
        codeVerifier,
        redirectUri,
      });

      const profile = await fetchYandexProfile(token.accessToken);
      const yandexUserId = profile.id;
      const sessionUser = await getSessionUser();

      if (sessionUser) {
        await upsertYandexLink({
          userId: sessionUser.id,
          yandexUserId,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
        });

        try {
          await ensureFreeSubscriptionsForRoles(sessionUser.id, sessionUser.roles);
        } catch (error) {
          logError("ensureFreeSubscriptionsForRoles failed after yandex link", {
            userProfileId: sessionUser.id,
            error: error instanceof Error ? error.stack : error,
          });
          void sendTelegramAlert(
            `User ${sessionUser.id} logged in without free subscription`,
            `auth:free-subscription:yandex-link:${sessionUser.id}`
          );
        }

        const redirectDecision = await resolveCabinetRedirect(sessionUser.id);
        const response = nextRedirect(req, redirectDecision.target);
        await setSessionCookies(response, {
          sub: sessionUser.id,
          phone: sessionUser.phone ?? null,
          roles: sessionUser.roles,
        });
        return response;
      }

      const link = await prisma.yandexLink.findUnique({
        where: { yandexUserId },
        select: { userId: true },
      });

      let user = link
        ? await prisma.userProfile.findUnique({
            where: { id: link.userId },
          })
        : null;

      if (!user && link) {
        throw new AppError("Yandex already linked to another user", 409, "YANDEX_ALREADY_LINKED");
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
        logError("ensureFreeSubscriptionsForRoles failed after yandex auth", {
          userProfileId: user.id,
          error: error instanceof Error ? error.stack : error,
        });
        void sendTelegramAlert(
          `User ${user.id} logged in without free subscription`,
          `auth:free-subscription:yandex-auth:${user.id}`
        );
      }

      await upsertYandexLink({
        userId: user.id,
        yandexUserId,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
      });

      const redirectDecision = await resolveCabinetRedirect(user.id);
      const response = nextRedirect(req, redirectDecision.target);
      await setSessionCookies(response, { sub: user.id, phone: user.phone ?? null, roles: user.roles });
      return response;
    } catch (error) {
      const appError = error instanceof AppError ? error : toAppError(error);
      return fail(appError.message, appError.status, appError.code, appError.details);
    }
  });
}
