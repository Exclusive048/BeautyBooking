import "server-only";

import { AppError } from "@/lib/api/errors";
import type { AdminAuditContext } from "@/lib/audit/admin-audit-context";
import { createAdminAuditLog } from "@/lib/audit/admin-audit";
import { openSecret, sealSecret } from "@/lib/crypto/sealed-secret";
import { env } from "@/lib/env";
import { logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import {
  fetchCommunityOfToken,
  probeCommunityMessagesAccess,
  type VkCommunityInfo,
} from "@/lib/vk/community-api";
import { parseVkCommunityRef, vkCommunityChatUrl, type VkCommunityRef } from "@/lib/vk/community-ref";

/**
 * VK-COMMUNITY-NOTIFY-01 — сообщество, от имени которого уходят уведомления.
 *
 * Решение владельца (2026-09-24): новой переменной окружения НЕТ.
 *  · КАКОЕ сообщество — берётся из уже существующей ссылки
 *    `NEXT_PUBLIC_VK_COMMUNITY_URL` (она же иконка ВК в футере).
 *  · Ключ доступа сообщества вводит администратор в `/admin/settings`; он
 *    хранится в `SystemConfig` зашифрованным (`crypto/sealed-secret.ts`).
 *
 * При сохранении ключ проверяется у VK: он должен принадлежать сообществу из
 * ссылки и иметь право «Сообщения сообщества». Если ссылку потом поменяют на
 * другое сообщество, сохранённый ключ перестаёт считаться настроенным — иначе
 * уведомления молча шли бы от имени не того сообщества.
 */

export const VK_COMMUNITY_CONFIG_KEY = "vkCommunity";
const SEAL_PURPOSE = "vk-community-token";

/**
 * Кэш в памяти процесса, а не в Redis: в нём лежит расшифрованный ключ.
 * Минута — сколько после сохранения в админке другим процессам (воркер,
 * второй контейнер) ждать нового ключа.
 */
const CACHE_TTL_MS = 60_000;

export type VkCommunity = VkCommunityInfo & {
  token: string;
  chatUrl: string;
};

type StoredVkCommunity = {
  v: 1;
  sealedToken: string;
  groupId: number;
  screenName: string;
  name: string;
  savedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStored(value: unknown): StoredVkCommunity | null {
  if (!isRecord(value)) return null;
  if (value.v !== 1) return null;
  if (typeof value.sealedToken !== "string" || value.sealedToken.length === 0) return null;
  if (typeof value.groupId !== "number" || typeof value.screenName !== "string") return null;
  return {
    v: 1,
    sealedToken: value.sealedToken,
    groupId: value.groupId,
    screenName: value.screenName,
    name: typeof value.name === "string" ? value.name : "",
    savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
  };
}

export function communityMatchesRef(ref: VkCommunityRef, info: Pick<VkCommunityInfo, "groupId" | "screenName">): boolean {
  if (ref.kind === "id") return info.groupId === ref.groupId;
  return info.screenName.toLowerCase() === ref.screenName;
}

function configuredRef(): VkCommunityRef | null {
  return parseVkCommunityRef(env.NEXT_PUBLIC_VK_COMMUNITY_URL);
}

async function readStoredRow(): Promise<StoredVkCommunity | null> {
  const row = await prisma.systemConfig.findUnique({
    where: { key: VK_COMMUNITY_CONFIG_KEY },
    select: { value: true },
  });
  return readStored(row?.value);
}

let cache: { value: VkCommunity | null; expiresAt: number } | null = null;

export function clearVkCommunityCache(): void {
  cache = null;
}

async function resolveVkCommunity(): Promise<VkCommunity | null> {
  const ref = configuredRef();
  if (!ref) return null;
  const stored = await readStoredRow();
  if (!stored) return null;

  if (!communityMatchesRef(ref, stored)) {
    logError("VK community token belongs to a different community than NEXT_PUBLIC_VK_COMMUNITY_URL", {
      storedGroupId: stored.groupId,
    });
    return null;
  }

  const token = openSecret(stored.sealedToken, SEAL_PURPOSE);
  if (!token) {
    // Чаще всего — сменили AUTH_JWT_SECRET: ключ нужно ввести заново.
    logError("VK community token cannot be decrypted", { storedGroupId: stored.groupId });
    return null;
  }

  return {
    token,
    groupId: stored.groupId,
    screenName: stored.screenName,
    name: stored.name,
    chatUrl: vkCommunityChatUrl(stored.screenName),
  };
}

/** Настроенное сообщество либо `null` — тогда канала ВКонтакте нет вовсе. */
export async function getVkCommunity(): Promise<VkCommunity | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;
  const value = await resolveVkCommunity();
  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export type VkCommunityAdminView = {
  /** Ссылка из env как есть — чтобы админ видел, какое сообщество ожидается. */
  communityUrl: string | null;
  urlRecognized: boolean;
  configured: boolean;
  community: { groupId: number; screenName: string; name: string; chatUrl: string } | null;
  /** Ключ сохранён, но ссылка теперь указывает на другое сообщество. */
  mismatch: boolean;
  /** Ключ сохранён, но не расшифровывается (сменили AUTH_JWT_SECRET). */
  unreadable: boolean;
};

/** Состояние для админки. Ключ наружу не отдаётся ни в каком виде. */
export async function getVkCommunityAdminView(): Promise<VkCommunityAdminView> {
  const communityUrl = env.NEXT_PUBLIC_VK_COMMUNITY_URL?.trim() || null;
  const ref = configuredRef();
  const stored = await readStoredRow();
  const community = stored
    ? {
        groupId: stored.groupId,
        screenName: stored.screenName,
        name: stored.name,
        chatUrl: vkCommunityChatUrl(stored.screenName),
      }
    : null;
  const mismatch = Boolean(stored && ref && !communityMatchesRef(ref, stored));
  const unreadable = Boolean(stored && openSecret(stored.sealedToken, SEAL_PURPOSE) === null);
  return {
    communityUrl,
    urlRecognized: ref !== null,
    configured: Boolean(stored && ref && !mismatch && !unreadable),
    community,
    mismatch,
    unreadable,
  };
}

function unavailable(): AppError {
  return new AppError("ВКонтакте сейчас не отвечает. Попробуйте ещё раз.", 503, "VK_COMMUNITY_UNAVAILABLE");
}

/**
 * Проверяет ключ у VK и сохраняет его. Бросает `AppError` с курируемым
 * текстом — админ должен понять, что именно поправить в настройках сообщества.
 */
export async function saveVkCommunityToken(input: {
  token: string;
  adminUserId: string;
  context: AdminAuditContext;
}): Promise<VkCommunityAdminView> {
  const ref = configuredRef();
  if (!ref) {
    throw new AppError(
      "Не задана ссылка на сообщество ВКонтакте — без неё непонятно, от чьего имени писать.",
      409,
      "VK_COMMUNITY_URL_MISSING",
    );
  }

  const token = input.token.trim();
  const community = await fetchCommunityOfToken(token);
  if (!community.ok) {
    if (community.kind === "retryable") throw unavailable();
    throw new AppError(
      "Ключ не подошёл. Проверьте, что он скопирован целиком и не удалён в настройках сообщества.",
      400,
      "VK_COMMUNITY_TOKEN_INVALID",
    );
  }

  if (!communityMatchesRef(ref, community.data)) {
    throw new AppError(
      `Это ключ другого сообщества («${community.data.name}»). Нужен ключ сообщества из ссылки в футере.`,
      409,
      "VK_COMMUNITY_MISMATCH",
    );
  }

  const access = await probeCommunityMessagesAccess(token);
  if (!access.ok) {
    if (access.kind === "retryable") throw unavailable();
    throw new AppError(
      "У ключа нет права «Сообщения сообщества». Создайте ключ с этим правом.",
      400,
      "VK_COMMUNITY_TOKEN_INVALID",
    );
  }

  const stored: StoredVkCommunity = {
    v: 1,
    sealedToken: sealSecret(token, SEAL_PURPOSE),
    groupId: community.data.groupId,
    screenName: community.data.screenName,
    name: community.data.name,
    savedAt: new Date().toISOString(),
  };

  await prisma.$transaction(async (tx) => {
    await tx.systemConfig.upsert({
      where: { key: VK_COMMUNITY_CONFIG_KEY },
      update: { value: stored },
      create: { key: VK_COMMUNITY_CONFIG_KEY, value: stored },
    });
    // Инв. #18: запись аудита в той же транзакции. Ключа в деталях нет.
    await createAdminAuditLog({
      tx,
      adminUserId: input.adminUserId,
      action: "SETTINGS_APP_SETTING_UPDATED",
      targetType: "system_config",
      targetId: VK_COMMUNITY_CONFIG_KEY,
      details: {
        key: VK_COMMUNITY_CONFIG_KEY,
        change: "token_set",
        groupId: stored.groupId,
        screenName: stored.screenName,
      },
      context: input.context,
    });
  });

  clearVkCommunityCache();
  return getVkCommunityAdminView();
}

export async function clearVkCommunityToken(input: {
  adminUserId: string;
  context: AdminAuditContext;
}): Promise<VkCommunityAdminView> {
  await prisma.$transaction(async (tx) => {
    const removed = await tx.systemConfig.deleteMany({ where: { key: VK_COMMUNITY_CONFIG_KEY } });
    if (removed.count === 0) return;
    await createAdminAuditLog({
      tx,
      adminUserId: input.adminUserId,
      action: "SETTINGS_APP_SETTING_UPDATED",
      targetType: "system_config",
      targetId: VK_COMMUNITY_CONFIG_KEY,
      details: { key: VK_COMMUNITY_CONFIG_KEY, change: "token_cleared" },
      context: input.context,
    });
  });

  clearVkCommunityCache();
  return getVkCommunityAdminView();
}
