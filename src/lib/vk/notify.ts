import "server-only";

import { randomInt } from "crypto";
import { logError, logInfo } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
import { toExternalSafeLink } from "@/lib/notifications/external-link";
import { enqueue } from "@/lib/queue/queue";
import { createVkSendJob, type VkSendPayload } from "@/lib/queue/types";
import { getVkCommunity } from "@/lib/vk/community";
import { sendCommunityMessage, VK_MESSAGE_MAX_LENGTH } from "@/lib/vk/community-api";

/**
 * VK-COMMUNITY-NOTIFY-01 — канал «ВКонтакте» для уведомлений: личное
 * сообщение от имени сообщества.
 *
 * Условия отправки (решение владельца 2026-09-24):
 *  · канал доступен ВСЕМ — клиентам, мастерам, студиям; тарифом не гейтится;
 *  · ВК привязан и тумблер «Уведомления ВКонтакте» не выключен
 *    (`VkLink.isEnabled`, по умолчанию включён при привязке);
 *  · сообщество настроено (`getVkCommunity`).
 * Разрешил ли человек сообщения от сообщества, здесь НЕ проверяется: это
 * вызов VK на каждое уведомление, а отказ VK (код 901) и так приходит при
 * отправке и обрабатывается как «этому получателю писать нельзя».
 */

/**
 * VK-LINK-NO-IDS (2026-10-02) — ссылка в сообщении без внутренних id: текст
 * хранит ВКонтакте. Правило общее с письмами — `toExternalSafeLink`.
 */
export function buildVkNotificationText(input: { title: string; body: string; url?: string }): string {
  const link = toExternalSafeLink(input.url);
  const parts = [input.title.trim(), input.body.trim(), link ?? ""].filter((part) => part.length > 0);
  const text = parts.join("\n\n");
  if (text.length <= VK_MESSAGE_MAX_LENGTH) return text;
  // Ссылка важнее хвоста текста: режем тело, а ссылку сохраняем.
  const suffix = link ? `…\n\n${link}` : "…";
  return `${text.slice(0, VK_MESSAGE_MAX_LENGTH - suffix.length)}${suffix}`;
}

/** Ставит сообщение в очередь, если получателю есть куда писать. Не бросает. */
export async function enqueueVkNotification(input: {
  userId: string;
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  const community = await getVkCommunity();
  if (!community) return;

  const link = await prisma.vkLink.findUnique({
    where: { userId: input.userId },
    select: { vkUserId: true, isEnabled: true },
  });
  if (!link?.vkUserId || !link.isEnabled) return;

  try {
    await enqueue(
      createVkSendJob({
        userId: input.userId,
        text: buildVkNotificationText(input),
        // `random_id` VK — int32; фиксируем при постановке, см. VkSendPayload.
        randomId: randomInt(1, 2_147_483_647),
      }),
    );
  } catch (error) {
    logError("Failed to enqueue VK notification", {
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type VkSendOutcome = "sent" | "skipped" | "retry";

/**
 * Отправка одной задачи `vk.send`. Решение о повторе — у воркера, здесь только
 * исход: повторять имеет смысл лишь сетевые сбои и лимиты VK; отказ по
 * получателю или по ключу повтором не лечится.
 */
export async function processVkSendPayload(payload: VkSendPayload): Promise<VkSendOutcome> {
  const community = await getVkCommunity();
  if (!community) return "skipped";

  const link = await prisma.vkLink.findUnique({
    where: { userId: payload.userId },
    select: { vkUserId: true, isEnabled: true },
  });
  if (!link?.vkUserId || !link.isEnabled) return "skipped";

  const result = await sendCommunityMessage(community.token, {
    vkUserId: link.vkUserId,
    message: payload.text,
    randomId: payload.randomId,
  });
  if (result.ok) return "sent";

  if (result.kind === "retryable") return "retry";

  if (result.kind === "recipient") {
    // Штатно: человек не разрешил сообщения от сообщества или закрыл личку.
    logInfo("vk.send.recipient-refused", { userId: payload.userId, errorCode: result.errorCode });
    return "skipped";
  }

  // Ключ отозван, нет права «Сообщения», неизвестный отказ — нужен человек.
  logError("VK community message rejected", {
    userId: payload.userId,
    kind: result.kind,
    errorCode: result.errorCode,
  });
  return "skipped";
}
