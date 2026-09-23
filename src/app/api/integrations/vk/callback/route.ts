import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { requireAuth } from "@/lib/auth/guards";
import { fail } from "@/lib/api/response";
import { AppError } from "@/lib/api/errors";
import { failOAuthCallback } from "@/lib/auth/oauth-callback-error";
import { exchangeVkCodeForToken, fetchVkProfile, requireVkRedirectUri } from "@/lib/vk/oauth";
import { readSignedVkCookieValue, VK_ID_STATE_COOKIE, VK_ID_VERIFIER_COOKIE } from "@/lib/vk/cookies";
import { nextRedirect } from "@/lib/http/origin";
import { isProduction, isVkAuthEnabled } from "@/lib/env";

const payloadSchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
  device_id: z.string().trim().min(1),
});

function clearVkCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.set(VK_ID_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });
  cookieStore.set(VK_ID_VERIFIER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });
}

/** RKN-FIX-12: identity only — provider tokens are never persisted. */
async function upsertVkLink(params: { userId: string; vkUserId: string; deviceId: string }) {
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

export async function GET(req: Request) {
  try {
    // AUTH-KILLSWITCH-ENFORCE-01: gate the connect callback too (issues the VK
    // link) — a gate on `start` alone is bypassable by hitting `callback`.
    if (!isVkAuthEnabled) {
      return fail("Этот способ входа недоступен.", 503, "SERVICE_UNAVAILABLE");
    }

    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const payloadRaw = url.searchParams.get("payload");
    if (!payloadRaw) {
      return fail("Не удалось войти через VK. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
    }

    let payloadValue: unknown;
    try {
      payloadValue = JSON.parse(payloadRaw);
    } catch {
      try {
        payloadValue = JSON.parse(decodeURIComponent(payloadRaw));
      } catch {
        return fail("Не удалось войти через VK. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
      }
    }

    const parsedPayload = payloadSchema.safeParse(payloadValue);
    if (!parsedPayload.success) {
      return fail("Не удалось войти через VK. Попробуйте ещё раз.", 400, "VALIDATION_ERROR");
    }

    const cookieStore = await cookies();
    const expectedState = readSignedVkCookieValue(cookieStore.get(VK_ID_STATE_COOKIE)?.value);
    const codeVerifier = readSignedVkCookieValue(cookieStore.get(VK_ID_VERIFIER_COOKIE)?.value);
    clearVkCookies(cookieStore);

    if (!expectedState || parsedPayload.data.state !== expectedState) {
      return fail("Подключение VK не завершилось. Начните заново.", 400, "VK_STATE_INVALID");
    }
    if (!codeVerifier) {
      return fail("Подключение VK не завершилось. Начните заново.", 400, "VALIDATION_ERROR");
    }

    const redirectUri = requireVkRedirectUri("integrations");
    const token = await exchangeVkCodeForToken({
      code: parsedPayload.data.code,
      codeVerifier,
      deviceId: parsedPayload.data.device_id,
      redirectUri,
      state: parsedPayload.data.state,
    });
    const profile = await fetchVkProfile(token.accessToken);

    await upsertVkLink({
      userId: auth.user.id,
      vkUserId: profile.id,
      deviceId: token.deviceId,
    });

    const redirectDecision = await resolveCabinetRedirect(auth.user.id);
    return nextRedirect(req, redirectDecision.target);
  } catch (error) {
    return failOAuthCallback(req, error);
  }
}
