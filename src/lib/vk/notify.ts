import "server-only";

import { randomInt } from "crypto";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { logError, logInfo } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";
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
 * VK-LINK-NO-IDS (2026-10-02, решение владельца) — в сообщение ВКонтакте ссылка
 * уходит БЕЗ внутренних идентификаторов.
 *
 * Пуш и письмо получают «глубокую» ссылку (`?focus=<id записи>`,
 * `?applicationId=…`, `?filterOffer=…`, `?c=<ключ переписки>`). Сама по себе она
 * доступа не даёт — страница требует входа и показывает только своё, — но
 * текст личного сообщения хранит ВКонтакте, то есть третья сторона, и
 * внутренним id там не место (то же, что rule 12 для публичных API).
 *
 * Поэтому от адреса остаётся только раздел: путь без query и без `#`, плюс
 * параметры из короткого списка заведомо безобидных (вид и день календаря,
 * время горящего окошка). Путь с сегментом, похожим на внутренний id, ссылки не
 * получает вовсе. Чужой домен — тоже: из ВКонтакте ведём только на свой сайт.
 * Список — разрешающий: новый параметр со ссылкой в ВК не уйдёт, пока его сюда
 * не внесут осознанно.
 */
export const VK_LINK_ALLOWED_PARAMS: ReadonlySet<string> = new Set([
  // Календарь студии: какой вид и какой день салона открыть.
  "view",
  "date",
  // Горящее окошко: время слота на публичной странице записи.
  "slotStartAt",
  // Каталог горящих окошек.
  "hot",
]);

/** CUID (`c` + 24 символа) и непрозрачный публичный id (`e_…`) — внутренние идентификаторы. */
const ID_LIKE_SEGMENT = /^(c[a-z0-9]{20,}|e_[A-Za-z0-9_-]+)$/;

export function toVkSafeLink(url: string | undefined): string | null {
  if (!url) return null;
  const base = resolvePublicAppUrl();
  if (!base) return null;

  let parsed: URL;
  let origin: URL;
  try {
    origin = new URL(base);
    parsed = new URL(url, origin);
  } catch {
    return null;
  }
  if (parsed.origin !== origin.origin) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.some((segment) => ID_LIKE_SEGMENT.test(decodeURIComponent(segment)))) return null;

  const kept = new URLSearchParams();
  for (const [key, value] of parsed.searchParams) {
    if (VK_LINK_ALLOWED_PARAMS.has(key)) kept.append(key, value);
  }
  const query = kept.toString();
  return `${origin.origin}${parsed.pathname}${query ? `?${query}` : ""}`;
}

export function buildVkNotificationText(input: { title: string; body: string; url?: string }): string {
  const link = toVkSafeLink(input.url);
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
