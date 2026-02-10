import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { requireAuth } from "@/lib/auth/guards";
import { fail } from "@/lib/api/response";
import { AppError, toAppError } from "@/lib/api/errors";
import { exchangeVkCodeForToken, fetchVkProfile, requireVkRedirectUri } from "@/lib/vk/oauth";
import { readSignedVkCookieValue, VK_ID_STATE_COOKIE, VK_ID_VERIFIER_COOKIE } from "@/lib/vk/cookies";
import { nextRedirect } from "@/lib/http/origin";

const payloadSchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
  device_id: z.string().trim().min(1),
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

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const payloadRaw = url.searchParams.get("payload");
    if (!payloadRaw) {
      return fail("VK payload is missing", 400, "VALIDATION_ERROR");
    }

    let payloadValue: unknown;
    try {
      payloadValue = JSON.parse(payloadRaw);
    } catch {
      try {
        payloadValue = JSON.parse(decodeURIComponent(payloadRaw));
      } catch {
        return fail("VK payload is invalid", 400, "VALIDATION_ERROR");
      }
    }

    const parsedPayload = payloadSchema.safeParse(payloadValue);
    if (!parsedPayload.success) {
      return fail("VK payload is invalid", 400, "VALIDATION_ERROR");
    }

    const cookieStore = await cookies();
    const expectedState = readSignedVkCookieValue(cookieStore.get(VK_ID_STATE_COOKIE)?.value);
    const codeVerifier = readSignedVkCookieValue(cookieStore.get(VK_ID_VERIFIER_COOKIE)?.value);
    clearVkCookies(cookieStore);

    if (!expectedState || parsedPayload.data.state !== expectedState) {
      return fail("Invalid state", 400, "VK_STATE_INVALID");
    }
    if (!codeVerifier) {
      return fail("VK code verifier is missing", 400, "VALIDATION_ERROR");
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
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      deviceId: token.deviceId,
    });

    const redirectDecision = await resolveCabinetRedirect(auth.user.id);
    return nextRedirect(req, redirectDecision.target);
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
