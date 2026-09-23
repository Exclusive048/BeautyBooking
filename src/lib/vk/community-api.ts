import "server-only";

/**
 * VK-COMMUNITY-NOTIFY-01 — вызовы VK API от имени СООБЩЕСТВА (ключ доступа
 * сообщества). Отдельно от `oauth.ts`: там VK ID и ключ пользователя, здесь —
 * платформенный ключ, которым уведомления уходят в личные сообщения.
 *
 * Модуль не знает, где лежит ключ (`community.ts`), и ничего не логирует:
 * ответ VK эхом возвращает параметры запроса, поэтому наружу отдаётся только
 * код ошибки и класс исхода, а не тело.
 */

const VK_API_BASE = "https://api.vk.com/method";
const VK_API_VERSION = "5.199";

/**
 * Граница одного вызова. Вызовы идут из воркера (отправка), из админки
 * (проверка ключа) и со страницы настроек (проверка разрешения) — везде
 * зависший VK не должен держать процесс дольше, чем человек готов ждать.
 */
export const VK_API_TIMEOUT_MS = 8_000;

/** Лимит VK на текст одного сообщения — 4096 символов. */
export const VK_MESSAGE_MAX_LENGTH = 4096;

/**
 * Классы исхода — ради решения «повторять ли», а не ради текста:
 * - `recipient` — этому человеку писать нельзя (не разрешил сообщения, закрыл
 *   личку, удалён). Повтор бесполезен.
 * - `config` — ключ отозван, у ключа нет права «Сообщения», сообщения
 *   сообщества выключены. Повтор бесполезен, нужен человек в админке.
 * - `retryable` — сеть, таймаут, 5xx, лимит частоты, внутренняя ошибка VK.
 * - `invalid` — прочие отказы VK (неизвестный код): не повторяем, но шумим.
 */
export type VkApiFailureKind = "recipient" | "config" | "retryable" | "invalid";

export type VkApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: VkApiFailureKind; errorCode: number | null };

// Коды из документации VK API («Коды ошибок»).
const RECIPIENT_ERROR_CODES = new Set([
  18, // страница удалена или заблокирована
  113, // неверный идентификатор пользователя
  900, // пользователь в чёрном списке сообщества
  901, // пользователь не разрешил сообщения от сообщества
  902, // настройки приватности пользователя
]);

const CONFIG_ERROR_CODES = new Set([
  5, // авторизация не удалась — ключ отозван или неверен
  7, // нет прав на действие — у ключа нет права «Сообщения сообщества»
  15, // доступ запрещён
  27, // ключ сообщества недействителен
  28, // ключ приложения недействителен
  203, // доступ к сообществу запрещён
]);

const RETRYABLE_ERROR_CODES = new Set([
  1, // неизвестная ошибка
  6, // слишком много запросов в секунду
  9, // флуд-контроль
  10, // внутренняя ошибка сервера VK
]);

export function classifyVkErrorCode(code: number): VkApiFailureKind {
  if (RECIPIENT_ERROR_CODES.has(code)) return "recipient";
  if (CONFIG_ERROR_CODES.has(code)) return "config";
  if (RETRYABLE_ERROR_CODES.has(code)) return "retryable";
  return "invalid";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type Params = Record<string, string | number>;

export async function callVkCommunityApi(
  method: string,
  token: string,
  params: Params,
  fetchImpl: typeof fetch = fetch,
): Promise<VkApiResult<unknown>> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) body.set(key, String(value));
  body.set("access_token", token);
  body.set("v", VK_API_VERSION);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VK_API_TIMEOUT_MS);
  try {
    // POST, а не GET: ключ не должен оказываться в URL (логи прокси, трассировки).
    const res = await fetchImpl(`${VK_API_BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, kind: "retryable", errorCode: null };
    const json: unknown = await res.json().catch(() => null);
    if (!isRecord(json)) return { ok: false, kind: "retryable", errorCode: null };
    if (isRecord(json.error)) {
      const code = typeof json.error.error_code === "number" ? json.error.error_code : null;
      return { ok: false, kind: code === null ? "invalid" : classifyVkErrorCode(code), errorCode: code };
    }
    if (!("response" in json)) return { ok: false, kind: "retryable", errorCode: null };
    return { ok: true, data: json.response };
  } catch {
    return { ok: false, kind: "retryable", errorCode: null };
  } finally {
    clearTimeout(timeout);
  }
}

export type VkCommunityInfo = {
  groupId: number;
  screenName: string;
  name: string;
};

function readGroup(value: unknown): VkCommunityInfo | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  const screenName = value.screen_name;
  const name = value.name;
  if (typeof id !== "number" || id <= 0) return null;
  return {
    groupId: id,
    screenName: typeof screenName === "string" && screenName.length > 0 ? screenName : `club${id}`,
    name: typeof name === "string" ? name : "",
  };
}

/**
 * Сообщество, которому выдан ключ. `groups.getById` без `group_id` с ключом
 * сообщества отвечает про само это сообщество. Форма ответа менялась: с
 * версии 5.194 это `{ groups: [...] }`, раньше — массив; читаем обе.
 */
export async function fetchCommunityOfToken(
  token: string,
  fetchImpl?: typeof fetch,
): Promise<VkApiResult<VkCommunityInfo>> {
  const result = await callVkCommunityApi("groups.getById", token, {}, fetchImpl);
  if (!result.ok) return result;
  const list = Array.isArray(result.data)
    ? result.data
    : isRecord(result.data) && Array.isArray(result.data.groups)
      ? result.data.groups
      : [];
  const group = readGroup(list[0]);
  if (!group) return { ok: false, kind: "invalid", errorCode: null };
  return { ok: true, data: group };
}

/**
 * Проверка права «Сообщения сообщества» без побочных эффектов и без чужих
 * данных в ответе, который нам нужен: читаем одну беседу и выбрасываем её.
 */
export async function probeCommunityMessagesAccess(
  token: string,
  fetchImpl?: typeof fetch,
): Promise<VkApiResult<true>> {
  const result = await callVkCommunityApi("messages.getConversations", token, { count: 1 }, fetchImpl);
  if (!result.ok) return result;
  return { ok: true, data: true };
}

export async function isMessagesFromCommunityAllowed(
  token: string,
  input: { groupId: number; vkUserId: string },
  fetchImpl?: typeof fetch,
): Promise<VkApiResult<boolean>> {
  const result = await callVkCommunityApi(
    "messages.isMessagesFromGroupAllowed",
    token,
    { group_id: input.groupId, user_id: input.vkUserId },
    fetchImpl,
  );
  if (!result.ok) return result;
  if (!isRecord(result.data)) return { ok: false, kind: "invalid", errorCode: null };
  return { ok: true, data: result.data.is_allowed === 1 };
}

export async function sendCommunityMessage(
  token: string,
  input: { vkUserId: string; message: string; randomId: number },
  fetchImpl?: typeof fetch,
): Promise<VkApiResult<true>> {
  const result = await callVkCommunityApi(
    "messages.send",
    token,
    {
      user_id: input.vkUserId,
      random_id: input.randomId,
      message: input.message.slice(0, VK_MESSAGE_MAX_LENGTH),
    },
    fetchImpl,
  );
  if (!result.ok) return result;
  return { ok: true, data: true };
}
