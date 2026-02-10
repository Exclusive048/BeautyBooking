import type { Prisma } from "@prisma/client";
import { AccountType } from "@prisma/client";
import { z } from "zod";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken } from "@/lib/auth/jwt";
import { resolveCabinetRedirect } from "@/lib/auth/cabinet-redirect";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { fail } from "@/lib/api/response";
import { parseQuery } from "@/lib/validation";
import { AppError, toAppError } from "@/lib/api/errors";
import { exchangeVkCodeForToken, fetchVkProfile, requireVkRedirectUri } from "@/lib/vk/oauth";
import { VK_AUTH_MODE_COOKIE, VK_AUTH_STATE_COOKIE } from "@/lib/vk/cookies";

const callbackSchema = z.object({
  code: z.string().trim().optional(),
  state: z.string().trim().optional(),
  error: z.string().trim().optional(),
  error_description: z.string().trim().optional(),
});

function clearVkAuthCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.set(VK_AUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  cookieStore.set(VK_AUTH_MODE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function buildDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  username?: string | null
): string | null {
  const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  if (fullName) return fullName;
  if (username) return username;
  return null;
}

async function linkVkAccount(userId: string, vkUserId: string, username: string | null, avatarUrl: string | null) {
  const existing = await prisma.vkLink.findUnique({
    where: { vkUserId },
    select: { userId: true },
  });

  if (existing && existing.userId !== userId) {
    throw new AppError("VK уже привязан к другому пользователю", 409, "VK_ALREADY_LINKED");
  }

  await prisma.vkLink.upsert({
    where: { userId },
    create: {
      userId,
      vkUserId,
      username,
      avatarUrl,
      isEnabled: true,
    },
    update: {
      vkUserId,
      username,
      avatarUrl,
      isEnabled: true,
    },
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = parseQuery(url, callbackSchema);

    const cookieStore = await cookies();
    const expectedState = cookieStore.get(VK_AUTH_STATE_COOKIE)?.value ?? null;
    const mode = cookieStore.get(VK_AUTH_MODE_COOKIE)?.value === "link" ? "link" : "login";
    clearVkAuthCookies(cookieStore);

    if (!expectedState || !query.state || query.state !== expectedState) {
      return fail("Invalid state", 400, "VK_STATE_INVALID");
    }

    if (query.error) {
      return fail("VK authorization failed", 400, "VK_OAUTH_FAILED", {
        error: query.error,
        description: query.error_description,
      });
    }

    if (!query.code) {
      return fail("VK code is missing", 400, "VALIDATION_ERROR");
    }

    const redirectUri = requireVkRedirectUri();
    const token = await exchangeVkCodeForToken(query.code, redirectUri);
    const profile = await fetchVkProfile(token.accessToken, token.userId);

    const vkUserId = profile.id;
    const username = profile.username ?? null;
    const avatarUrl = profile.avatarUrl ?? null;

    const sessionUser = await getSessionUser();

    if (mode === "link") {
      if (!sessionUser) {
        return fail("Unauthorized", 401, "UNAUTHORIZED");
      }

      await linkVkAccount(sessionUser.id, vkUserId, username, avatarUrl);

      const redirectDecision = await resolveCabinetRedirect(sessionUser.id);
      return NextResponse.redirect(new URL(redirectDecision.target, req.url));
    }

    if (sessionUser) {
      await linkVkAccount(sessionUser.id, vkUserId, username, avatarUrl);
      const redirectDecision = await resolveCabinetRedirect(sessionUser.id);
      return NextResponse.redirect(new URL(redirectDecision.target, req.url));
    }

    const linked = await prisma.vkLink.findUnique({
      where: { vkUserId },
      select: { userId: true },
    });

    let user = linked
      ? await prisma.userProfile.findUnique({
          where: { id: linked.userId },
        })
      : null;

    if (!user) {
      const firstName = profile.firstName?.trim() || null;
      const lastName = profile.lastName?.trim() || null;
      const displayName = buildDisplayName(firstName, lastName, username);

      user = await prisma.userProfile.create({
        data: {
          firstName,
          lastName,
          displayName,
          externalPhotoUrl: avatarUrl,
          roles: [AccountType.CLIENT],
        },
      });

      await prisma.vkLink.create({
        data: {
          userId: user.id,
          vkUserId,
          username,
          avatarUrl,
          isEnabled: true,
        },
      });
    } else {
      const updateData: Prisma.UserProfileUpdateInput = {};
      if (!user.firstName && profile.firstName) updateData.firstName = profile.firstName;
      if (!user.lastName && profile.lastName) updateData.lastName = profile.lastName;
      if (!user.displayName) {
        const displayName = buildDisplayName(profile.firstName, profile.lastName, username);
        if (displayName) updateData.displayName = displayName;
      }
      if (avatarUrl && avatarUrl !== user.externalPhotoUrl) {
        updateData.externalPhotoUrl = avatarUrl;
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

      await prisma.vkLink.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          vkUserId,
          username,
          avatarUrl,
          isEnabled: true,
        },
        update: {
          vkUserId,
          username,
          avatarUrl,
          isEnabled: true,
        },
      });
    }

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
    return NextResponse.redirect(new URL(redirectDecision.target, req.url));
  } catch (error) {
    const appError = error instanceof AppError ? error : toAppError(error);
    return fail(appError.message, appError.status, appError.code, appError.details);
  }
}
