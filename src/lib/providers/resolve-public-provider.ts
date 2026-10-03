import { prisma } from "@/lib/prisma";
import { resolvePublicUsername } from "@/lib/publicUsername";
import { looksLikeProviderId, resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";

/**
 * MOBILE-B3 — поиск провайдера по адресу так же, как его ищет страница
 * `/u/[username]`: прямое совпадение `publicUsername` (или CUID), иначе —
 * старый адрес из `PublicUsernameAlias`. Ровно те же два запроса, что в
 * `findProviderByUsernameOrAlias` страницы.
 */
export async function findProviderByUsernameOrAlias(username: string) {
  const [direct, alias] = await Promise.all([
    resolveProviderBySlugOrId({
      key: username,
      select: { id: true, publicUsername: true, isPublished: true, type: true },
    }),
    prisma.provider.findFirst({
      where: { publicUsernameAliases: { some: { username } } },
      select: { id: true, publicUsername: true, isPublished: true, type: true },
    }),
  ]);
  return direct ?? alias;
}

/**
 * MOBILE-B3 — ключ провайдера из публичного JSON-маршрута (`/api/providers/{key}`,
 * `/api/public/providers/{key}/{packages,overview}`), приведённый к тому, что
 * открывает веб-страница `/u/{key}`.
 *
 * - CUID (`looksLikeProviderId`) — без изменений и без запроса: дальше его
 *   проверяет `resolveProviderBySlugOrId`.
 * - Адрес — регистр не важен, старый адрес (alias) ведёт на текущий:
 *   `resolvePublicUsername` (то же правило, что у страницы: slugify +
 *   нижний регистр, запасной путь для legacy-адресов с `_`). Найден → его
 *   точный адрес; alias → канонический адрес.
 * - Не нашлось — исходная строка как есть: прежнее точное совпадение остаётся
 *   рабочим (поведение до MOBILE-B3 не сужается), и дальше обычный 404.
 *
 * Публикацию проверяет вызывающий (`requirePublished` / `getProviderProfile`):
 * здесь только «какую строку искать».
 */
export async function canonicalPublicProviderKey(rawKey: string): Promise<string> {
  const trimmed = rawKey.trim();
  if (!trimmed || looksLikeProviderId(trimmed)) return trimmed;

  // Совпавший адрес запоминается: «найден» — это точное совпадение
  // `publicUsername` с нормализованным (или legacy, в нижнем регистре) ключом,
  // и дальше ищется именно он — по уникальному индексу, независимо от формы id.
  const matched: { publicUsername: string | null } = { publicUsername: null };
  const result = await resolvePublicUsername(
    {
      findProviderByUsernameOrAlias: async (username) => {
        const provider = await findProviderByUsernameOrAlias(username);
        if (provider) matched.publicUsername = provider.publicUsername;
        return provider;
      },
    },
    trimmed,
  );
  if (result.status === "found") return matched.publicUsername ?? result.providerId;
  if (result.status === "redirect") return result.username;
  return trimmed;
}
