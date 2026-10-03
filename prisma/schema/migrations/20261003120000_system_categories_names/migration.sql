-- SYSTEM-CATEGORIES-02 (запрос владельца 2026-10-03: «Брови» → «Оформление
-- бровей») — системные категории каталога называются так, как называют услугу.
--
-- Только данные, схема не меняется (создана руками, а не `migrate dev`: дропа
-- `media_asset_embeddings_embedding_hnsw_idx` здесь нет и быть не должно —
-- реестр scripts/raw-sql-objects.mjs, гейт check:migration-drops).
--
-- Переименовываются ровно строки набора SYSTEM-CATEGORIES-01 (слаг верхнего
-- уровня), чьё название по-прежнему прежнее: категорию, которую админ уже
-- переименовал, миграция не трогает. Если на верхнем уровне уже есть другая
-- категория с новым названием (регистр, пробелы и «ё»/«е» не различаются),
-- строка тоже остаётся как есть — двух одноимённых категорий не появится.
--
-- Новые названия — src/lib/catalog/system-categories.ts (прежние — в
-- `formerNames`); сторож `system-categories.test.ts` сверяет строки ниже со
-- списком кода.
UPDATE "GlobalCategory" AS g
SET "name" = v."toName", "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('eyebrows',   'Брови',                'Оформление бровей'),
  ('eyelashes',  'Ресницы',              'Наращивание и ламинирование ресниц'),
  ('hairstyle',  'Причёски',             'Причёски и укладки'),
  ('depilation', 'Депиляция и шугаринг', 'Восковая депиляция и шугаринг')
) AS v("slug", "fromName", "toName")
WHERE g."slug" = v."slug"
  AND g."parent_id" IS NULL
  AND g."name" = v."fromName"
  AND NOT EXISTS (
    SELECT 1 FROM "GlobalCategory" o
    WHERE o."parent_id" IS NULL
      AND o."id" <> g."id"
      AND regexp_replace(replace(lower(btrim(o."name")), 'ё', 'е'), '\s+', ' ', 'g')
        = regexp_replace(replace(lower(btrim(v."toName")), 'ё', 'е'), '\s+', ' ', 'g')
  );
