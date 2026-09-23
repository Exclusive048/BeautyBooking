/**
 * VK-COMMUNITY-NOTIFY-01 — какое сообщество указано ссылкой
 * `NEXT_PUBLIC_VK_COMMUNITY_URL` (решение владельца: ID сообщества берётся из
 * существующей ссылки, отдельной переменной нет).
 *
 * Ссылка бывает двух видов: `vk.com/club123` (`public123`, `event123`) несёт
 * числовой ID прямо в адресе, а `vk.com/masterryadom` — короткое имя, ID по
 * которому знает только VK. Поэтому результат — либо ID, либо имя, и сверка с
 * сообществом ключа (`communityMatchesRef`) умеет оба.
 *
 * Чистый модуль без зависимостей: его читают и сервер, и тесты.
 */

export type VkCommunityRef =
  | { kind: "id"; groupId: number }
  | { kind: "screen"; screenName: string };

const VK_HOSTS = new Set(["vk.com", "vk.ru", "m.vk.com", "m.vk.ru", "www.vk.com", "www.vk.ru", "vk.me"]);
const NUMERIC_PATH = /^(?:club|public|event)(\d+)$/i;
const SCREEN_NAME = /^[a-z0-9_.]{2,64}$/i;

export function parseVkCommunityRef(raw: string | null | undefined): VkCommunityRef | null {
  const value = raw?.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!VK_HOSTS.has(url.hostname.toLowerCase())) return null;

  const segment = url.pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;

  const numeric = NUMERIC_PATH.exec(segment);
  if (numeric) {
    const groupId = Number(numeric[1]);
    return Number.isSafeInteger(groupId) && groupId > 0 ? { kind: "id", groupId } : null;
  }
  if (!SCREEN_NAME.test(segment)) return null;
  return { kind: "screen", screenName: segment.toLowerCase() };
}

/**
 * Чат с сообществом. `vk.me` открывает приложение ВКонтакте на телефоне и
 * веб-версию на компьютере; короткое имя есть у каждого сообщества (у
 * сообщества без своего имени это `club<ID>`).
 */
export function vkCommunityChatUrl(screenName: string): string {
  return `https://vk.me/${encodeURIComponent(screenName)}`;
}
