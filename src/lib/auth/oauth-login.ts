import type { Prisma, UserProfile } from "@prisma/client";
import { AccountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import type { OAuthLoginProvider } from "@/lib/auth/oauth-providers";
import { applyProviderVerifiedPhoneSafe, type ProviderPhoneOutcome } from "@/lib/auth/phone-provider-proof";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { ensureFreeSubscriptionsForRoles } from "@/lib/billing/ensure-free-subscription";
import { hasRequiredConsents, type ConsentFlags } from "@/lib/legal/consent-flags";
import { recordUserConsents } from "@/lib/legal/consent";
import { logError, logInfo } from "@/lib/logging/logger";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";

/**
 * MOBILE-AUTH-A2 — кто вошёл через VK ID / Яндекс ID: общий сервис для веба и
 * приложения.
 *
 * До пакета логика жила прямо в двух колбэках-близнецах
 * (`/api/auth/{vk,yandex}/callback`). Мобильный флоу проходит через ТЕ ЖЕ
 * колбэки и обязан решать ровно то же: fail-safe согласий (RKN-FIX-01 — без
 * доказуемого согласия аккаунт не создаётся), запрет перехвата чужой связки
 * (`*_ALREADY_LINKED` 409), подтверждение номера провайдером
 * (PHONE-OAUTH-PROOF-01), бесплатные подписки, запись согласий,
 * `ensureClientRoleForUser`. Копия разошлась бы с оригиналом на первой же
 * правке гейта, поэтому здесь — всё до выдачи сессии, а транспорт (куки и
 * кабинет у веба, одноразовый код у приложения) решает колбэк.
 *
 * Порядок вызовов, тексты логов и ключи алертов — те же, что были в колбэках:
 * веб после выноса ведёт себя байт-в-байт как до него.
 *
 * RKN-FIX-12: в БД пишется только identity связки — токены провайдера остаются
 * в области видимости колбэка и не сохраняются.
 */

/** Профиль провайдера в общей форме (`VkProfile` / `YandexProfile` совпадают по форме). */
export type OAuthProviderProfile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type OAuthIdentity =
  | { provider: "vk"; profile: OAuthProviderProfile; deviceId: string }
  | { provider: "yandex"; profile: OAuthProviderProfile };

/** Согласия флоу (подписанная state-bound кука) и доказательная обвязка записи. */
export type OAuthConsentContext = {
  flags: ConsentFlags | null;
  ipAddress: string | null;
  userAgent: string | null;
};

const PROVIDER_LOG_LABEL: Record<OAuthLoginProvider, string> = { vk: "VK", yandex: "Yandex" };

export function oauthAlreadyLinkedError(provider: OAuthLoginProvider): AppError {
  return provider === "vk"
    ? new AppError("Этот аккаунт VK уже привязан к другому пользователю.", 409, "VK_ALREADY_LINKED")
    : new AppError("Этот аккаунт Яндекс ID уже привязан к другому пользователю.", 409, "YANDEX_ALREADY_LINKED");
}

function buildDisplayName(firstName?: string | null, lastName?: string | null) {
  const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return fullName || null;
}

async function findLinkedUserId(identity: OAuthIdentity): Promise<string | null> {
  const link =
    identity.provider === "vk"
      ? await prisma.vkLink.findUnique({ where: { vkUserId: identity.profile.id }, select: { userId: true } })
      : await prisma.yandexLink.findUnique({
          where: { yandexUserId: identity.profile.id },
          select: { userId: true },
        });
  return link?.userId ?? null;
}

/**
 * RKN-FIX-12: persists the IDENTITY of the link only. The provider tokens from
 * the code exchange stay in the caller's local scope (they are what
 * `fetch*Profile` is called with) and are never written to the database.
 */
async function upsertOAuthLink(identity: OAuthIdentity, userId: string): Promise<void> {
  if (identity.provider === "vk") {
    const vkUserId = identity.profile.id;
    const existing = await prisma.vkLink.findUnique({
      where: { vkUserId },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId) throw oauthAlreadyLinkedError("vk");

    await prisma.vkLink.upsert({
      where: { userId },
      create: {
        userId,
        vkUserId,
        deviceId: identity.deviceId,
        isEnabled: true,
      },
      // VK-COMMUNITY-NOTIFY-01: повторный вход не трогает `isEnabled` — иначе
      // выключенные человеком уведомления ВКонтакте молча включались бы при
      // каждом входе через VK. При первой привязке (`create`) они включены.
      update: {
        vkUserId,
        deviceId: identity.deviceId,
      },
    });
    return;
  }

  const yandexUserId = identity.profile.id;
  const existing = await prisma.yandexLink.findUnique({
    where: { yandexUserId },
    select: { userId: true },
  });
  if (existing && existing.userId !== userId) throw oauthAlreadyLinkedError("yandex");

  await prisma.yandexLink.upsert({
    where: { userId },
    create: {
      userId,
      yandexUserId,
      isEnabled: true,
    },
    update: {
      yandexUserId,
      isEnabled: true,
    },
  });
}

async function ensureFreeSubscriptionsAfterOAuth(
  user: { id: string; roles: AccountType[] },
  provider: OAuthLoginProvider,
  stage: "link" | "auth",
): Promise<void> {
  try {
    await ensureFreeSubscriptionsForRoles(user.id, user.roles);
  } catch (error) {
    logError(`ensureFreeSubscriptionsForRoles failed after ${provider} ${stage}`, {
      userProfileId: user.id,
      error: error instanceof Error ? error.stack : error,
    });
    void sendTelegramAlert(
      "A user logged in without a free subscription",
      `auth:free-subscription:${provider}-${stage}`,
    );
  }
}

/**
 * Привязка аккаунта провайдера к уже известному пользователю: у веба — к
 * сессии браузера, у приложения — к владельцу link-intent. Регистрации нет,
 * поэтому согласия не обязательны; пришедшие с формы входа — записываются.
 *
 * Возвращает итог подтверждения номера (PHONE-OAUTH-PROOF-01) — веб строит по
 * нему возврат на страницу «Подтвердить номер».
 */
export async function linkOAuthIdentity(input: {
  identity: OAuthIdentity;
  user: { id: string; roles: AccountType[] };
  consent: OAuthConsentContext;
}): Promise<ProviderPhoneOutcome | null> {
  const { identity, user, consent } = input;

  await upsertOAuthLink(identity, user.id);

  if (consent.flags) {
    await recordUserConsents({
      userId: user.id,
      flags: consent.flags,
      ipAddress: consent.ipAddress,
      userAgent: consent.userAgent,
    });
  }

  await ensureFreeSubscriptionsAfterOAuth(user, identity.provider, "link");

  // PHONE-OAUTH-PROOF-01: номер из аккаунта провайдера подтверждён им по SMS —
  // засчитываем как владение (правила — `phone-provider-proof.ts`).
  return applyProviderVerifiedPhoneSafe({
    userId: user.id,
    providerPhone: identity.profile.phone,
    provider: identity.provider,
  });
}

export type OAuthLoginResolution =
  | { ok: true; user: UserProfile }
  /** RKN-FIX-01: вход создал бы аккаунт, а доказуемого согласия нет. */
  | { ok: false; reason: "consent_required" };

/**
 * Вход без известного пользователя: найти по связке либо создать.
 *
 * Бросает `AppError` 409 `*_ALREADY_LINKED`, если связка указывает на
 * несуществующий профиль или привязку пытаются переписать на другого.
 */
export async function resolveOAuthLogin(input: {
  identity: OAuthIdentity;
  consent: OAuthConsentContext;
}): Promise<OAuthLoginResolution> {
  const { identity, consent } = input;
  const { profile, provider } = identity;

  const linkedUserId = await findLinkedUserId(identity);

  let user = linkedUserId
    ? await prisma.userProfile.findUnique({
        where: { id: linkedUserId },
      })
    : null;

  if (!user && linkedUserId) {
    throw oauthAlreadyLinkedError(provider);
  }

  if (!user) {
    // RKN-FIX-01 — the fail-safe. An OAuth visitor must never end up with a
    // created account and zero consent rows: without provable consent the
    // account is simply not created, and the visitor is sent back to tick the
    // boxes again (the usual cause is a consent cookie that expired during a
    // slow round-trip).
    if (!hasRequiredConsents(consent.flags)) {
      // No provider id in the line: this is an unregistered visitor and the
      // id is the only identifier we hold for them.
      logInfo(`${PROVIDER_LOG_LABEL[provider]} auth refused: required consents missing`, { stage: "new-user" });
      return { ok: false, reason: "consent_required" };
    }

    user = await prisma.userProfile.create({
      data: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: buildDisplayName(profile.firstName, profile.lastName),
        // PHONE-OAUTH-PROOF-01: номер пишет `applyProviderVerifiedPhoneSafe`
        // ниже — с отметкой владения и снятием чужих заявок. Сырая запись
        // здесь падала P2002 на занятом номере и роняла вход целиком.
        // FIX-B5 (вариант B): адрес от провайдера — ЗАЯВКА, отметки владения
        // он не получает (инв. #41).
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

  await ensureFreeSubscriptionsAfterOAuth(user, provider, "auth");

  await upsertOAuthLink(identity, user.id);

  await applyProviderVerifiedPhoneSafe({ userId: user.id, providerPhone: profile.phone, provider });

  // Registration and repeat login share this write: on a fresh account it
  // records the proof, on a returning one `recordUserConsents` no-ops unless a
  // document version moved on.
  if (consent.flags) {
    await recordUserConsents({
      userId: user.id,
      flags: consent.flags,
      ipAddress: consent.ipAddress,
      userAgent: consent.userAgent,
    });
  }

  return { ok: true, user };
}
