-- VISIBILITY-DEFAULT-01 — включить видимость всем существующим кабинетам
-- (решение владельца 2026-09-23: «всем существующим включить видимость в
-- каталоге именно переключалку»).
--
-- Схему миграция не меняет — только данные, один раз. Новые кабинеты и так
-- рождаются с `isPublished = true` (src/lib/profiles/professional.ts), а в
-- каталоге провайдер появляется, когда есть город и хотя бы один рабочий день
-- (src/lib/providers/catalog-visibility.ts) — то есть включённый переключатель
-- без расписания в выдачу не выводит, выведет само расписание.
--
-- Выборка:
--   * мастера-одиночки (`studioId IS NULL`) и студии;
--   * только ЖИВЫЕ кабинеты: владелец есть и не удалён, и у строки есть
--     кабинет — `MasterProfile` у мастера, `Studio` у студии. `ownerUserId`
--     одного признака мало: до 2026-09-22 удаление кабинета владельца НЕ
--     снимало (гасило только `isPublished`/`publicUsername` и удаляло
--     `MasterProfile`/`Studio`), и такая строка по старой ссылке
--     `/providers/<id>` снова открыла бы страницу удалённого кабинета;
--   * мастера студий НЕ трогаются: у них `isPublished` — это «активен в
--     студии» (инв. #24), им управляет администратор студии (пауза/активация).
UPDATE "Provider"
SET "isPublished" = true
WHERE "isPublished" = false
  AND "ownerUserId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "UserProfile" u
    WHERE u."id" = "Provider"."ownerUserId" AND u."isDeleted" = false
  )
  AND (
    (
      "type" = 'STUDIO'
      AND EXISTS (SELECT 1 FROM "Studio" s WHERE s."providerId" = "Provider"."id")
    )
    OR (
      "type" = 'MASTER'
      AND "studioId" IS NULL
      AND EXISTS (SELECT 1 FROM "MasterProfile" m WHERE m."providerId" = "Provider"."id")
    )
  );

-- Мастера студий без своего города получают город и адрес студии. В каталоге
-- находят по городу, а приглашённый мастер рождался без адреса, и ни приём
-- приглашения, ни привязка к студии город не ставили — такой мастер не
-- находился нигде. Рантайм делает то же при вступлении
-- (`lib/studios/masters.ts` → `inheritStudioLocation`); свой город мастера не
-- перезаписывается.
UPDATE "Provider" AS m
SET "cityId" = s."cityId",
    "address" = s."address",
    "district" = s."district",
    "geoLat" = s."geoLat",
    "geoLng" = s."geoLng"
FROM "Provider" AS s
WHERE m."type" = 'MASTER'
  AND m."studioId" = s."id"
  AND m."cityId" IS NULL
  AND s."cityId" IS NOT NULL;
