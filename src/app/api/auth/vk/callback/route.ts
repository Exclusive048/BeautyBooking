import type { Prisma } from "@prisma/client";
import { AccountType } from "@prisma/client";
import { z } from "zod";
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
import { exchangeVkCodeForToken, fetchVkProfile, requireVkRedirectUri } from "@/lib/vk/oauth";
import { readSignedVkCookieValue, VK_ID_STATE_COOKIE, VK_ID_VERIFIER_COOKIE } from "@/lib/vk/cookies";
import { hasRequiredConsents } from "@/lib/legal/consent-flags";
import { readConsentCookieValue, VK_CONSENT_COOKIE } from "@/lib/legal/oauth-consent-cookie";
import { recordUserConsents } from "@/lib/legal/consent";
import { extractClientIp } from "@/lib/http/ip";
import { isProduction, isVkAuthEnabled } from "@/lib/env";

const callbackSchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
  device_id: z.string().trim().min(1),
  type: z.string().trim().optional(),
});

function clearVkCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  // RKN-FIX-01: the consent cookie is single-use like the state/verifier pair —
  // cleared on every exit path so it can never be reused by a later flow.
  for (const name of [VK_ID_STATE_COOKIE, VK_ID_VERIFIER_COOKIE, VK_CONSENT_COOKIE]) {
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
 * RKN-FIX-12: persists the IDENTITY of the link only. The provider tokens from
 * the code exchange stay in the caller's local scope (they are what
 * `fetchVkProfile` is called with) and are never written to the database.
 */
async function upsertVkLink(params: { userId: string; vkUserId: string; deviceId: string }) {
  const existing = await prisma.vkLink.findUnique({
    where: { vkUserId: params.vkUserId },
    select: { userId: true },
  });

  if (existing && existing.userId !== params.userId) {
    throw new AppError("Этот аккаунт VK уже привязан к другому пользователю.", 409, "VK_ALREADY_LINKED");
  }

  await prisma.vkLink.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      vkUserId: params.vkUserId,
      deviceId: params.deviceId,
      isEnabled: true,
    },
    // VK-COMMUNITY-NOTIFY-01: повторный вход не трогает `isEnabled` — иначе
    // выключенные человеком уведомления ВКонтакте молча включались бы при
    // каждом входе через VK. При первой привязке (`create`) они включены.
    update: {
      vkUserId: params.vkUserId,
      deviceId: params.deviceId,
    },
  });
}

function parseVkCallback(url: URL): z.infer<typeof callbackSchema> {
  const sp = url.searchParams;
  const payloadRaw = sp.get("payload");
  if (payloadRaw) {
    let payloadValue: unknown;

    try {
      payloadValue = JSON.parse(payloadRaw);
    } catch {
      try {
        payloadValue = JSON.parse(decodeURIComponent(payloadRaw));
      } catch {
        throw new AppError("Не удалось войти через VK. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
      }
    }

    const parsed = callbackSchema.safeParse(payloadValue);
    if (!parsed.success) {
      throw new AppError("Не удалось войти через VK. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
    }
    return parsed.data;
  }

  const directValue = {
    code: sp.get("code"),
    state: sp.get("state"),
    device_id: sp.get("device_id"),
    type: sp.get("type") ?? undefined,
  };
  const parsed = callbackSchema.safeParse(directValue);
  if (!parsed.success) {
    throw new AppError("Не удалось войти через VK. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
  }
  return parsed.data;
}

export async function GET(req: Request) {
  return withRequestContext(req, async () => {
    // AUTH-KILLSWITCH-ENFORCE-01: gate the callback too — gating `start` alone
    // is bypassable by hitting `callback` directly (this is the leg that issues
    // the session). Refuse before touching cookies / creds / OAuth exchange.
    if (!isVkAuthEnabled) {
      return fail("Этот способ входа недоступен.", 503, "SERVICE_UNAVAILABLE");
    }

    const cookieStore = await cookies();

    try {
      const url = new URL(req.url);
      const parsedCallback = parseVkCallback(url);
      const expectedState = readSignedVkCookieValue(cookieStore.get(VK_ID_STATE_COOKIE)?.value);
      const codeVerifier = readSignedVkCookieValue(cookieStore.get(VK_ID_VERIFIER_COOKIE)?.value);
      const rawConsentCookie = cookieStore.get(VK_CONSENT_COOKIE)?.value;

      clearVkCookies(cookieStore);

      if (!expectedState || parsedCallback.state !== expectedState) {
        return fail("Вход через VK не завершился. Начните заново.", 400, "VK_STATE_INVALID");
      }
      if (!codeVerifier) {
        return fail("Вход через VK не завершился. Начните заново.", 400, "VALIDATION_ERROR");
      }

      // RKN-FIX-01: the flags are trusted only after the signature AND the
      // state binding check — a cookie from another flow, a tampered one, or
      // one whose 10-minute TTL lapsed mid-round-trip all resolve to `null`,
      // which reads as "no consent captured" (never as consent granted).
      const consentFlags = readConsentCookieValue(rawConsentCookie, expectedState);
      const ipAddress = extractClientIp(req);
      const userAgent = req.headers.get("user-agent");

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

      if (sessionUser) {
        await upsertVkLink({
          userId: sessionUser.id,
          vkUserId,
          deviceId: token.deviceId,
        });

        // Linking VK to an account that already exists registers nobody, so it
        // is never blocked; flags are still honoured if the visitor happened to
        // come through the login form.
        if (consentFlags) {
          await recordUserConsents({ userId: sessionUser.id, flags: consentFlags, ipAddress, userAgent });
        }

        try {
          await ensureFreeSubscriptionsForRoles(sessionUser.id, sessionUser.roles);
        } catch (error) {
          logError("ensureFreeSubscriptionsForRoles failed after vk link", {
            userProfileId: sessionUser.id,
            error: error instanceof Error ? error.stack : error,
          });
          void sendTelegramAlert(
            "A user logged in without a free subscription",
            "auth:free-subscription:vk-link"
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
        throw new AppError("Этот аккаунт VK уже привязан к другому пользователю.", 409, "VK_ALREADY_LINKED");
      }

      if (!user) {
        // RKN-FIX-01 — the fail-safe. An OAuth visitor must never end up with a
        // created account and zero consent rows: without provable consent the
        // account is simply not created, and the visitor is sent back to the
        // login form to tick the boxes again (the usual cause is a consent
        // cookie that expired during a slow round-trip).
        if (!hasRequiredConsents(consentFlags)) {
          // No provider id in the line: this is an unregistered visitor and the
          // id is the only identifier we hold for them.
          logInfo("VK auth refused: required consents missing", { stage: "new-user" });
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
        logError("ensureFreeSubscriptionsForRoles failed after vk auth", {
          userProfileId: user.id,
          error: error instanceof Error ? error.stack : error,
        });
        void sendTelegramAlert(
          "A user logged in without a free subscription",
          "auth:free-subscription:vk-auth"
        );
      }

      await upsertVkLink({
        userId: user.id,
        vkUserId,
        deviceId: token.deviceId,
      });

      // Registration and repeat login share this write: on a fresh account it
      // records the proof, on a returning one `recordUserConsents` no-ops
      // unless a document version moved on.
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
