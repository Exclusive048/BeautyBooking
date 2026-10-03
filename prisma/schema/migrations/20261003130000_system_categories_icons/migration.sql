-- CATEGORY-ICONS-01 (запрос владельца 2026-10-03: «ко всем добавляемым
-- категориям смайлики, чтоб видно было») — у каждой категории фиксированного
-- набора есть смайлик.
--
-- Только данные, схема не меняется (создана руками, а не `migrate dev`: дропа
-- `media_asset_embeddings_embedding_hnsw_idx` здесь нет и быть не должно —
-- реестр scripts/raw-sql-objects.mjs, гейт check:migration-drops).
--
-- Набор, созданный миграцией 20261001124736, смайлики уже несёт. Без смайлика
-- остались строки, которые были в базе ДО набора и потому им засчитаны
-- (правило `planSystemCategoryCreates`): категория с тем же слагом — на любом
-- уровне, — либо одноимённая категория верхнего уровня (регистр, пробелы и
-- «ё»/«е» не различаются; сверяется и текущее, и прежнее название —
-- `formerNames`). Такой строке ставится смайлик набора.
--
-- 🔴 Только пустой смайлик: выбранный админом не меняется (админка правит его
-- с CATEGORY-ICONS-01). Повторный прогон ничего не пишет.
--
-- Смайлики — src/lib/catalog/system-categories.ts; сторож
-- `system-categories.test.ts` сверяет строки ниже со списком кода.
UPDATE "GlobalCategory" AS g
SET "icon" = v."icon", "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES
  ('manicure',    'Маникюр',                            '💅'),
  ('pedicure',    'Педикюр',                            '🦶'),
  ('makeup',      'Макияж',                             '💄'),
  ('eyebrows',    'Оформление бровей',                  '🖌️'),
  ('eyebrows',    'Брови',                              '🖌️'),
  ('eyelashes',   'Наращивание и ламинирование ресниц', '👁️'),
  ('eyelashes',   'Ресницы',                            '👁️'),
  ('instant-tan', 'Моментальный загар',                 '☀️'),
  ('hairstyle',   'Причёски и укладки',                 '💁‍♀️'),
  ('hairstyle',   'Причёски',                           '💁‍♀️'),
  ('hair',        'Парикмахерские услуги',              '💇'),
  ('depilation',  'Восковая депиляция и шугаринг',      '🍯'),
  ('depilation',  'Депиляция и шугаринг',               '🍯')
) AS v("slug", "name", "icon")
WHERE (g."icon" IS NULL OR btrim(g."icon") = '')
  AND (
    g."slug" = v."slug"
    OR (
      g."parent_id" IS NULL
      AND regexp_replace(replace(lower(btrim(g."name")), 'ё', 'е'), '\s+', ' ', 'g')
        = regexp_replace(replace(lower(btrim(v."name")), 'ё', 'е'), '\s+', ' ', 'g')
    )
  );
