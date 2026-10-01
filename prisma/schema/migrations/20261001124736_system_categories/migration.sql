-- SYSTEM-CATEGORIES-01 (решение владельца 2026-10-01) — фиксированный плоский
-- набор категорий каталога есть на любой базе, в том числе на пустой сразу
-- после миграций.
--
-- Только данные, схема не меняется. Сгенерированный `migrate dev` дроп
-- `media_asset_embeddings_embedding_hnsw_idx` удалён: Prisma не выражает
-- HNSW-индекс и дописывает его DROP в каждую новую миграцию (реестр
-- scripts/raw-sql-objects.mjs, гейт check:migration-drops).
--
-- «Всегда» держит шаг деплоя `npm run deploy:post` (scripts/post-deploy.ts →
-- ensureSystemCategories, список — src/lib/catalog/system-categories.ts): он
-- досоздаёт категорию набора, которой в базе нет. Здесь — снимок списка на дату;
-- сторож `system-categories.test.ts` требует, чтобы каждая строка ниже осталась
-- в списке кода.
--
-- 🔴 Только досоздание: существующие строки не меняются. Категория считается
-- существующей, если занят её слаг ИЛИ на верхнем уровне уже есть одноимённая
-- (регистр, пробелы и «ё»/«е» не различаются) — то же правило, что
-- `planSystemCategoryCreates`.
INSERT INTO "GlobalCategory" (
  "id", "name", "slug", "icon", "parent_id", "orderIndex",
  "status", "isSystem", "visibleToAll", "createdAt", "updatedAt"
)
SELECT
  'syscat_' || v."slug", v."name", v."slug", v."icon", NULL, v."orderIndex",
  'APPROVED'::"CategoryStatus", true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('manicure',    'Маникюр',               '💅',  1),
  ('pedicure',    'Педикюр',               '🦶',  2),
  ('makeup',      'Макияж',                '💄',  3),
  ('eyebrows',    'Брови',                 '🖌️', 4),
  ('eyelashes',   'Ресницы',               '👁️', 5),
  ('instant-tan', 'Моментальный загар',    '☀️', 6),
  ('hairstyle',   'Причёски',              '💁‍♀️', 7),
  ('hair',        'Парикмахерские услуги', '💇',  8),
  ('depilation',  'Депиляция и шугаринг',  '🍯',  9)
) AS v("slug", "name", "icon", "orderIndex")
WHERE NOT EXISTS (
    SELECT 1 FROM "GlobalCategory" g WHERE g."slug" = v."slug"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "GlobalCategory" g
    WHERE g."parent_id" IS NULL
      AND regexp_replace(replace(lower(btrim(g."name")), 'ё', 'е'), '\s+', ' ', 'g')
        = regexp_replace(replace(lower(btrim(v."name")), 'ё', 'е'), '\s+', ' ', 'g')
  )
ON CONFLICT DO NOTHING;
