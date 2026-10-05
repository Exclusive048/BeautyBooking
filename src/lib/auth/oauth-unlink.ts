import "server-only";

import { AppError } from "@/lib/api/errors";
import { resolveAuthMethods } from "@/lib/auth/auth-methods";
import type { OAuthLoginProvider } from "@/lib/auth/oauth-providers";
import { prisma } from "@/lib/prisma";

/**
 * VK-YANDEX-UNLINK-01 — «Отвязать VK / Яндекс ID» удаляет связку из профиля.
 *
 * Раньше `/api/auth/{vk,yandex}/unlink` только снимали `isEnabled` (по сути —
 * выключали уведомления VK), а вход через провайдера по-прежнему вёл в этот
 * аккаунт. Решение владельца (2026-10-03): отвязка значит отвязка — строка
 * `VkLink` / `YandexLink` удаляется, следующий вход через этого провайдера —
 * уже не в этот профиль (`resolveOAuthLogin` ищет только по связке). Вместе со
 * связкой VK уходят и уведомления ВКонтакте: они живут на той же строке.
 * Выключить только уведомления — `/api/integrations/vk/disable`.
 *
 * Отвязать последний способ входа нельзя — иначе человек теряет аккаунт:
 * `409 LAST_LOGIN_METHOD`. Способ входа засчитывается, только если он сейчас
 * реально работает: подтверждённый телефон при включённом SMS-входе,
 * подтверждённая почта при настроенной отправке писем, Telegram-вход,
 * связка другого провайдера при включённом провайдере.
 */
export async function unlinkOAuthIdentity(
  userId: string,
  provider: OAuthLoginProvider,
): Promise<{ unlinked: boolean }> {
  const user = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: {
      phone: true,
      phoneVerifiedAt: true,
      email: true,
      emailVerifiedAt: true,
      telegramId: true,
      vkLink: { select: { id: true } },
      yandexLink: { select: { id: true } },
    },
  });
  if (!user) return { unlinked: false };

  const link = provider === "vk" ? user.vkLink : user.yandexLink;
  // Нечего отвязывать — ответ тот же, что после отвязки (повтор безопасен).
  if (!link) return { unlinked: false };

  const methods = await resolveAuthMethods();
  const hasOtherLogin =
    (methods.phone && Boolean(user.phone) && Boolean(user.phoneVerifiedAt)) ||
    (methods.email && Boolean(user.email) && Boolean(user.emailVerifiedAt)) ||
    (methods.telegram && Boolean(user.telegramId)) ||
    (provider === "vk" ? methods.yandex && Boolean(user.yandexLink) : methods.vk && Boolean(user.vkLink));
  if (!hasOtherLogin) {
    throw new AppError(
      "Это единственный способ входа в аккаунт. Сначала подтвердите телефон или почту в профиле.",
      409,
      "LAST_LOGIN_METHOD",
    );
  }

  if (provider === "vk") {
    await prisma.vkLink.deleteMany({ where: { userId } });
  } else {
    await prisma.yandexLink.deleteMany({ where: { userId } });
  }
  return { unlinked: true };
}
