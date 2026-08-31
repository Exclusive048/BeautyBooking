import { AccountType, Prisma, type UserProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import {
  classifyPhoneLoginTarget,
  releaseUnverifiedPhoneClaims,
  type PhoneLoginTarget,
} from "@/lib/auth/phone-claim";
import { logInfo } from "@/lib/logging/logger";
import { maskPhone } from "@/lib/logging/masking";

// OTP-PHONE-LOGIN-RACE: local P2002 constant, mirroring the other
// re-read-on-conflict sites (`email-login-profile.ts`, `detect-city.ts`,
// `conversation-slug.ts`).
const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * Resolve the {@link UserProfile} for a phone-OTP login.
 *
 * PHONE-CLAIM-01: с появлением кабинетных ЗАЯВОК на номер (без OTP-
 * доказательства) строка, найденная по телефону, больше не означает «этот
 * человек вернулся». Каршрут триажа — `classifyPhoneLoginTarget`
 * (`phone-claim.ts`), маршрут зовёт его сам (ответ нужен гейту согласий ДО
 * сжигания кода) и передаёт сюда:
 *
 *  - **OWNER** (`phoneVerifiedAt` стоит) → обычный вход, ensure CLIENT role;
 *  - **GUEST_CONVERSION** (guest-class строка) → вход + отметка владения:
 *    пассивный профиль гостевых броней становится аккаунтом — прежнее
 *    поведение, теперь со штампом;
 *  - **FOREIGN_CLAIM** (заявка установившегося аккаунта) → вход в него был бы
 *    перехватом (зеркало FIX-SEC-EMAIL-IDENTITY-01, только канал — телефон).
 *    Заявка освобождается, доказавший получает СВЕЖИЙ профиль с
 *    `phoneVerifiedAt = now()` — ровно как email-модель: заявки не резолвят
 *    личность, владение даёт только код;
 *  - **NONE** → первый вход, свежий профиль сразу с отметкой владения.
 *
 * Race loser: два одновременных первых входа для одного номера оба проходят
 * `findUnique` (оба видят пустоту), оба `create`; проигравший ловит **P2002**
 * на `UserProfile.phone @unique`, перечитывает строку победителя и — важно —
 * ПЕРЕтриажирует её (7th re-read-on-conflict site): выигравшей могла оказаться
 * и параллельная кабинетная заявка, входить в неё нельзя и после гонки.
 */
export async function resolvePhoneLoginProfile(
  normalizedPhone: string,
  target: PhoneLoginTarget,
  attempt = 0,
): Promise<UserProfile> {
  if (target.kind === "OWNER") {
    return withClientRole(target.profile);
  }

  if (target.kind === "GUEST_CONVERSION") {
    // Отметка владения идемпотентна: guard `phoneVerifiedAt: null` в where не
    // трогает уже подтверждённую строку (повторный вход, параллельный запрос).
    await prisma.userProfile.updateMany({
      where: { id: target.profile.id, phoneVerifiedAt: null },
      data: { phoneVerifiedAt: new Date() },
    });
    return withClientRole({ ...target.profile, phoneVerifiedAt: target.profile.phoneVerifiedAt ?? new Date() });
  }

  if (target.kind === "FOREIGN_CLAIM") {
    const released = await releaseUnverifiedPhoneClaims(prisma, normalizedPhone, null);
    logInfo("phone-otp login released a foreign unverified claim", {
      phone: maskPhone(normalizedPhone),
      released,
    });
  }

  try {
    return await prisma.userProfile.create({
      data: {
        phone: normalizedPhone,
        // Владение доказано только что введённым кодом — свежий профиль
        // рождается подтверждённым (зеркало email-логина, инв. #41).
        phoneVerifiedAt: new Date(),
        roles: [AccountType.CLIENT],
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_VIOLATION &&
      attempt < 2
    ) {
      // Race: параллельный запрос успел занять номер. Перечитать И перетриажировать.
      const recovered = await prisma.userProfile.findUnique({
        where: { phone: normalizedPhone },
      });
      if (recovered) {
        const recoveredTarget = await classifyPhoneLoginTarget(recovered);
        return resolvePhoneLoginProfile(normalizedPhone, recoveredTarget, attempt + 1);
      }
    }
    throw error;
  }
}

/**
 * Ensure the profile carries the CLIENT role. `ensureClientRoleForUser`
 * returns the same array reference when CLIENT is already present, so this is
 * a no-op (no write) for a row that already has it.
 */
async function withClientRole(profile: UserProfile): Promise<UserProfile> {
  const nextRoles = await ensureClientRoleForUser(profile.id, profile.roles);
  return nextRoles === profile.roles ? profile : { ...profile, roles: nextRoles };
}
