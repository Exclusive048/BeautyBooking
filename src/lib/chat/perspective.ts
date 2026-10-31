import { AccountType } from "@prisma/client";
import type { ConversationParticipant } from "@/lib/chat/conversation-access";

/**
 * Сторона переписки из `?as=` маршрутов чата: `client` / `master` / `studio`
 * (STUDIO-CHAT). Без параметра — мастер, если у пользователя есть роль
 * мастера, иначе клиент. Это только ПОДСКАЗКА: право на сторону проверяет
 * `resolveConversationAccess` (и список — свой резолвер студии).
 */
export function resolveChatPerspective(
  asParam: string | null,
  roles: readonly AccountType[],
): ConversationParticipant {
  if (asParam === "client") return "CLIENT";
  if (asParam === "master") return "MASTER";
  if (asParam === "studio") return "STUDIO";
  return roles.includes(AccountType.MASTER) ? "MASTER" : "CLIENT";
}
