import type { UserProfile, Prisma } from "@prisma/client";
import { AccountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyTelegramLogin } from "@/lib/auth/telegram";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { telegramLoginSchema } from "@/lib/auth/schemas";
import type { z } from "zod";

export type TelegramLoginPayload = z.infer<typeof telegramLoginSchema>;

type AuthErrorStatus = 400 | 401 | 403 | 409 | 500;

type TelegramAuthResult =
  | { ok: true; user: UserProfile }
  | { ok: false; status: AuthErrorStatus; message: string; code?: string };

function isAuthDateFresh(authDate: number, nowSeconds: number): boolean {
  const maxAgeSeconds = 60 * 60;
  if (authDate > nowSeconds + 60) return false;
  return nowSeconds - authDate <= maxAgeSeconds;
}

function buildDisplayName(firstName: string, lastName?: string | null, username?: string | null) {
  const fullName = `${firstName} ${lastName ?? ""}`.trim();
  if (fullName) return fullName;
  if (username) return username;
  return null;
}

export async function authenticateTelegramLogin(
  payload: TelegramLoginPayload,
  botToken: string
): Promise<TelegramAuthResult> {
  const isValid = verifyTelegramLogin(payload, botToken);
  if (!isValid) {
    return { ok: false, status: 401, message: "Invalid telegram hash", code: "INVALID_HASH" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!isAuthDateFresh(payload.auth_date, nowSeconds)) {
    return { ok: false, status: 401, message: "Auth data expired", code: "AUTH_DATE_EXPIRED" };
  }

  const telegramId = String(payload.id);
  let profile = await prisma.userProfile.findUnique({ where: { telegramId } });

  if (!profile) {
    const displayName = buildDisplayName(payload.first_name, payload.last_name, payload.username);
    profile = await prisma.userProfile.create({
      data: {
        telegramId,
        telegramUsername: payload.username ?? null,
        firstName: payload.first_name,
        lastName: payload.last_name ?? null,
        displayName,
        roles: [AccountType.CLIENT],
      },
    });
    return { ok: true, user: profile };
  }

  const updateData: Prisma.UserProfileUpdateInput = {};
  if (!profile.firstName && payload.first_name) updateData.firstName = payload.first_name;
  if (!profile.lastName && payload.last_name) updateData.lastName = payload.last_name;
  if (!profile.displayName) {
    const displayName = buildDisplayName(payload.first_name, payload.last_name, payload.username);
    if (displayName) updateData.displayName = displayName;
  }
  if (payload.username && payload.username !== profile.telegramUsername) {
    updateData.telegramUsername = payload.username;
  }

  if (Object.keys(updateData).length > 0) {
    profile = await prisma.userProfile.update({
      where: { id: profile.id },
      data: updateData,
    });
  }

  const nextRoles = await ensureClientRoleForUser(profile.id, profile.roles);
  if (nextRoles !== profile.roles) {
    profile = { ...profile, roles: nextRoles };
  }

  return { ok: true, user: profile };
}
