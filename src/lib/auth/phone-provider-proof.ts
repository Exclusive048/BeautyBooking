import { Prisma } from "@prisma/client";
import { releaseUnverifiedPhoneClaims } from "@/lib/auth/phone-claim";
import { linkGuestBookingsToUserByPhone } from "@/lib/bookings/link-guest-bookings";
import { logError, logInfo } from "@/lib/logging/logger";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";
import { invalidateMeIdentityCache } from "@/lib/users/me";

/**
 * PHONE-OAUTH-PROOF-01 (2026-09-24, решение владельца: «если есть
 * альтернативные варианты подтверждения телефона — давай попробуем»).
 *
 * Второй, кроме phone-OTP, источник ВЛАДЕНИЯ номером (`phoneVerifiedAt`,
 * инв. #46): номер, который отдал VK ID (`phone`) или Яндекс ID
 * (`default_phone`). Оба провайдера привязывают номер к аккаунту только по SMS,
 * то есть проверку уже провели за нас. SMS-шлюза в проде нет, и без этого
 * подтверждённых номеров не было ни у кого — а на них держатся приглашения в
 * студию по телефону и прикрепление гостевых записей.
 *
 * ⚠️ Отличие от email (FIX-B5): адрес из VK/Яндекса остаётся ЗАЯВКОЙ — у почты
 * провайдеры признака подтверждённости не отдают. Номер телефона в VK ID и
 * Яндекс ID — идентификатор аккаунта, подтверждаемый кодом; поэтому здесь иначе.
 *
 * Правила — те же, что у phone-OTP, и в одном месте:
 *  · номер нормализуется; не российский/пустой → `no_phone`;
 *  · у пользователя уже ДРУГОЙ номер → `mismatch`, ничего не меняем: кабинетную
 *    заявку молча не подменяем номером провайдера;
 *  · номер ПОДТВЕРЖДЁН у другого аккаунта → `taken` (владелец один);
 *  · иначе чужие непроверенные заявки снимаются (как при OTP) и номер
 *    записывается с отметкой владения.
 */
export type ProviderPhoneOutcome = "verified" | "already" | "mismatch" | "taken" | "no_phone";

export type PhoneProofProvider = "vk" | "yandex";

export async function applyProviderVerifiedPhone(input: {
  userId: string;
  providerPhone: string | null | undefined;
  provider: PhoneProofProvider;
}): Promise<ProviderPhoneOutcome> {
  const phone = input.providerPhone ? normalizeRussianPhone(input.providerPhone) : null;
  if (!phone) return "no_phone";

  const user = await prisma.userProfile.findUnique({
    where: { id: input.userId },
    select: { phone: true, phoneVerifiedAt: true },
  });
  if (!user) return "no_phone";
  if (user.phone && user.phone !== phone) return "mismatch";
  if (user.phone === phone && user.phoneVerifiedAt) return "already";

  const owner = await prisma.userProfile.findFirst({
    where: { phone, phoneVerifiedAt: { not: null }, id: { not: input.userId } },
    select: { id: true },
  });
  if (owner) return "taken";

  try {
    await prisma.$transaction(async (tx) => {
      await releaseUnverifiedPhoneClaims(tx, phone, input.userId);
      await tx.userProfile.update({
        where: { id: input.userId },
        data: { phone, phoneVerifiedAt: new Date() },
      });
    });
  } catch (error) {
    // Гонка с другим доказательством владения того же номера: полный @unique
    // на `phone` отдал слот первому — это и есть «номер занят».
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "taken";
    }
    throw error;
  }

  logInfo("Phone ownership proven by OAuth provider", {
    userProfileId: input.userId,
    provider: input.provider,
  });

  // Как после phone-OTP: владельцу номера — его гостевые записи, свежий `/api/me`.
  try {
    await linkGuestBookingsToUserByPhone({ userProfileId: input.userId, phoneRaw: phone });
  } catch (error) {
    logError("linkGuestBookingsToUserByPhone failed after provider phone proof", {
      userProfileId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await invalidateMeIdentityCache(input.userId);

  return "verified";
}

/**
 * Не роняет вход: подтверждение номера — побочный выигрыш OAuth-потока, и
 * отказ БД здесь не должен стоить пользователю сессии.
 */
export async function applyProviderVerifiedPhoneSafe(
  input: Parameters<typeof applyProviderVerifiedPhone>[0],
): Promise<ProviderPhoneOutcome | null> {
  try {
    return await applyProviderVerifiedPhone(input);
  } catch (error) {
    logError("applyProviderVerifiedPhone failed", {
      userProfileId: input.userId,
      provider: input.provider,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
