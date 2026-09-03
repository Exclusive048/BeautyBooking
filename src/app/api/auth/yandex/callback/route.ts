import type { Prisma } from "@prisma/client";
import { AccountType } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { withRequestContext } from "@/lib/api/with-request-context";
import { AppError } from "@/lib/api/errors";
import { failOAuthCallback } from "@/lib/auth/oauth-callback-error";
import { fail } from "@/lib/api/response";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { getSessionUser, setSessionCookies } from "@/lib/auth/session";
import { ensureFreeSubscriptionsForRoles } from "@/lib/billing/ensure-free-subscription";
import { nextRedirect } from "@/lib/http/origin";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { exchangeYandexCodeForToken, fetchYandexProfile, requireYandexRedirectUri } from "@/lib/yandex/oauth";
import { yandexCallbackSchema } from "@/lib/yandex/schemas";
import {
  readSignedYandexCookieValue,
  YANDEX_STATE_COOKIE,
  YANDEX_VERIFIER_COOKIE,
} from "@/lib/yandex/cookies";
import { hasRequiredConsents } from "@/lib/legal/consent-flags";
import { readConsentCookieValue, YANDEX_CONSENT_COOKIE } from "@/lib/legal/oauth-consent-cookie";
import { recordUserConsents } from "@/lib/legal/consent";
import { extractClientIp } from "@/lib/http/ip";
import { isProduction, isYandexAuthEnabled } from "@/lib/env";

// FIX-YANDEX-OAUTH — callback route. Account-linking logic mirrors
// api/auth/vk/callback EXACTLY (the security-sensitive new-vs-existing-user
// branch + the "already linked to another user" 409 guard).

function clearYandexCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  // RKN-FIX-01: consent cookie is single-use alongside state/verifier.
  for (const name of [YANDEX_STATE_COOKIE, YANDEX_VERIFIER_COOKIE, YANDEX_CONSENT_COOKIE]) {
    cookieStore.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
      maxAge: 0,
    });
  }
}

function buildDisplayName(firstName?: string | null, lastName?: string | null) {
  const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return fullName || null;
}

/**
 * RKN-FIX-12: identity only — the token from the code exchange is used for
 * `fetchYandexProfile` in the caller's scope and never persisted.
 */
async function upsertYandexLink(params: { userId: string; yandexUserId: string }) {
  const existing = await prisma.yandexLink.findUnique({
    where: { yandexUserId: params.yandexUserId },
    select: { userId: true },
  });

  if (existing && existing.userId !== params.userId) {
    throw new AppError("Этот аккаунт Яндекс ID уже привязан к другому пользователю.", 409, "YANDEX_ALREADY_LINKED");
  }

  await prisma.yandexLink.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      yandexUserId: params.yandexUserId,
      isEnabled: true,
    },
    update: {
      yandexUserId: params.yandexUserId,
      isEnabled: true,
    },
  });
}

export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    // AUTH-KILLSWITCH-ENFORCE-01: gate the callback too (the session-issuing
    // leg) — a gate on `start` alone is bypassable by hitting `callback`.
    if (!isYandexAuthEnabled) {
      return fail("Этот способ входа недоступен.", 503, "SERVICE_UNAVAILABLE");
    }

    const cookieStore = await cookies();

    try {
      const url = new URL(req.url);
      const parsed = yandexCallbackSchema.safeParse({
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
      });
      if (!parsed.success) {
        clearYandexCookies(cookieStore);
        return fail("Не удалось войти через Яндекс. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
      }
      const parsedCallback = parsed.data;

      const expectedState = readSignedYandexCookieValue(cookieStore.get(YANDEX_STATE_COOKIE)?.value);
      const codeVerifier = readSignedYandexCookieValue(cookieStore.get(YANDEX_VERIFIER_COOKIE)?.value);
      const rawConsentCookie = cookieStore.get(YANDEX_CONSENT_COOKIE)?.value;

      clearYandexCookies(cookieStore);

      if (!expectedState || parsedCallback.state !== expectedState) {
        return fail("Вход через Яндекс не завершился. Начните заново.", 400, "YANDEX_STATE_INVALID");
      }
      if (!codeVerifier) {
        return fail("Вход через Яндекс не завершился. Начните заново.", 400, "VALIDATION_ERROR");
      }

      // RKN-FIX-01 — signature + state binding gate the flags (see the VK
      // callback and `oauth-consent-cookie.ts`).
      const consentFlags = readConsentCookieValue(rawConsentCookie, expectedState);
      const ipAddress = extractClientIp(req);
      const userAgent = req.headers.get("user-agent");

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
        });

        // Session-link: registers nobody, so never blocked — flags honoured if
        // the visitor came through the login form.
        if (consentFlags) {
          await recordUserConsents({ userId: sessionUser.id, flags: consentFlags, ipAddress, userAgent });
        }

        try {
          await ensureFreeSubscriptionsForRoles(sessionUser.id, sessionUser.roles);
        } catch (error) {
          logError("ensureFreeSubscriptionsForRoles failed after yandex link", {
            userProfileId: sessionUser.id,
            error: error instanceof Error ? error.stack : error,
          });
          void sendTelegramAlert(
            "A user logged in without a free subscription",
            "auth:free-subscription:yandex-link"
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
        throw new AppError("Этот аккаунт Яндекс ID уже привязан к другому пользователю.", 409, "YANDEX_ALREADY_LINKED");
      }

      if (!user) {
        // RKN-FIX-01 fail-safe — no consent, no account (see VK callback).
        if (!hasRequiredConsents(consentFlags)) {
          logInfo("Yandex auth refused: required consents missing", { stage: "new-user" });
          return nextRedirect(req, "/login?error=consent");
        }

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
          "A user logged in without a free subscription",
          "auth:free-subscription:yandex-auth"
        );
      }

      await upsertYandexLink({
        userId: user.id,
        yandexUserId,
      });

      // Registration + repeat login share this write (no-op unless a document
      // version moved on).
      if (consentFlags) {
        await recordUserConsents({ userId: user.id, flags: consentFlags, ipAddress, userAgent });
      }

      const redirectDecision = await resolveCabinetRedirect(user.id);
      const response = nextRedirect(req, redirectDecision.target);
      await setSessionCookies(response, { sub: user.id, phone: user.phone ?? null, roles: user.roles });
      return response;
    } catch (error) {
      return failOAuthCallback(req, error);
    }
  });
}
