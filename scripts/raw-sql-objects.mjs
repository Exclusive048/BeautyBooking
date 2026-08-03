/**
 * GATES-FIX-01 — реестр объектов БД, которые СУЩЕСТВУЮТ ТОЛЬКО В СЫРОМ SQL.
 *
 * ## Зачем это вообще нужно
 *
 * Prisma умеет описывать не всё. Индекс `hnsw` из pgvector — не умеет: тип
 * `Hnsw` не входит в её список (`BTree|Hash|Gist|Gin|SpGist|Brin`), проверено
 * на 6.19.2 — `@@index([embedding], type: Hnsw)` даёт `P1012 Unknown index
 * type`. Плюс сама колонка — `Unsupported("vector(256)")`.
 *
 * Из этого следуют ДВА разных отказа, и лечатся они по-разному:
 *
 *   1. `prisma migrate diff` (гейт `check:schema-drift`) видит существующий в
 *      БД индекс, не находит его в датамодели и репортит **фантомный дрейф**.
 *      Гейт краснел на чистом HEAD с 2026-07-13 — то есть работал как
 *      «всегда красный», и его перестали читать. Лечится фильтром: statement,
 *      относящийся к объекту из этого реестра, дрейфом не считается.
 *
 *   2. `prisma migrate dev` при генерации ЛЮБОЙ новой миграции дописывает в
 *      неё `DROP INDEX` на этот индекс. Это **опаснее**: применённый DROP молча
 *      превращает ANN-поиск visual-search в seq-scan, ошибок при этом ноль.
 *      Уже дважды снималось руками (RKN-FIX-12, RKN-FIX-10) — то есть это не
 *      случайность, а гарантированное поведение. Лечится вторым гейтом
 *      (`check:migration-drops`), который валит CI, если DROP всё-таки уехал
 *      в файл миграции.
 *
 * ## Правила ведения
 *
 * • Имена — **точные строки**, не паттерны и не regex. Паттерн вроде
 *   `/_hnsw_idx$/` завтра тихо разрешит дропнуть чужой индекс.
 * • Каждая запись обязана назвать миграцию-источник и цену потери.
 * • Список должен оставаться коротким. Растёт он только там, где Prisma
 *   физически не может выразить объект, — не там, где так удобнее.
 *
 * Ожидаемый следующий житель: partial unique index для отзыва согласий
 * (RKN-FIX-18) — `WHERE "revokedAt" IS NULL` Prisma тоже не выражает.
 */

/**
 * @typedef {Object} RawSqlObject
 * @property {"index"} kind
 * @property {string} name        Точное имя объекта в БД.
 * @property {string} table       Таблица, к которой он относится.
 * @property {string} migration   Миграция, создавшая его.
 * @property {string} why         Почему он не выражается в датамодели.
 * @property {string} costIfLost  Что сломается, если объект пропадёт.
 */

/** @type {RawSqlObject[]} */
export const RAW_SQL_OBJECTS = [
  {
    kind: "index",
    name: "media_asset_embeddings_embedding_hnsw_idx",
    table: "media_asset_embeddings",
    migration: "20260713120000_reduce_embedding_dimensions_yandex",
    why: "pgvector HNSW: Prisma не знает тип индекса `Hnsw` (проверено на 6.19.2 — P1012), а колонка объявлена как Unsupported(\"vector(256)\")",
    costIfLost:
      "ANN-поиск visual-search деградирует в seq-scan по всей таблице эмбеддингов — молча, без единой ошибки. Сейчас visual-search dormant, поэтому цена нулевая; в день включения (VISUAL_SEARCH_ENABLED=true) она становится боевой",
  },
  {
    kind: "index",
    name: "UserConsent_active_unique_idx",
    table: "UserConsent",
    migration: "20260803123705_rkn_fix_18_consent_withdrawal",
    why: "partial unique (`WHERE \"revokedAt\" IS NULL`): Prisma не выражает частичные уникальные индексы, а полный @@unique здесь нельзя — он запрещал бы вторую строку той же версии и тем самым заставлял ОЖИВЛЯТЬ отозванную, стирая историю отзыва",
    costIfLost:
      "Исчезает гарантия БД «одна АКТИВНАЯ строка согласия на (user, цель, версия)». Останется только прикладная проверка в lib/legal/consent.ts (инв. #37), то есть гонка двух одновременных переключений сможет создать два активных согласия на одну цель — и журнал согласий станет неоднозначным ровно там, где он служит доказательством",
  },
];

/** Точные имена — для быстрых проверок. */
export const RAW_SQL_OBJECT_NAMES = RAW_SQL_OBJECTS.map((o) => o.name);

/**
 * Маркер, которым автор миграции ЯВНО подтверждает намеренный дроп такого
 * объекта. Без него `check:migration-drops` валит CI.
 *
 *   -- ALLOW-DROP: media_asset_embeddings_embedding_hnsw_idx — причина
 *   DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";
 *
 * Смысл маркера: сделать удаление **осознанным действием**, а не побочным
 * эффектом `migrate dev`, который никто не вычитал.
 */
export const ALLOW_DROP_MARKER = "ALLOW-DROP:";

/**
 * Относится ли SQL-statement к объекту из реестра.
 * Сопоставление по точному имени в кавычках или без.
 */
export function matchesRawSqlObject(statement) {
  return RAW_SQL_OBJECTS.find((obj) => {
    const quoted = new RegExp(`"${obj.name}"`);
    const bare = new RegExp(`\\b${obj.name}\\b`);
    return quoted.test(statement) || bare.test(statement);
  });
}
