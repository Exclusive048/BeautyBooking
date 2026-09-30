-- SCHEDULE-PATTERNS-01 (этап 1, 2026-09-28): одна строка «Особого дня» на дату.
--
-- Без уникальности параллельное автосохранение создавало дубли, и читатели
-- расходились в выборе строки (LOGIC-11 свёл их к общему канону, но дубли не
-- убрал). Календарь на 3 месяца с покраской дней сделал бы их частыми.
--
-- 1) Дедуп — по ТОМУ ЖЕ канону, по которому строку уже выбирают движок, guard
--    рабочих часов и писатели (`SCHEDULE_OVERRIDE_PICK_ORDER`: свежая правка,
--    `id` — тай-брейк). Остаётся ровно та строка, что и так действовала, поэтому
--    удаление поведение не меняет. Перерывы дня (`ScheduleBreak` вида OVERRIDE)
--    привязаны к дате, а не к строке, и не затрагиваются.
DELETE FROM "ScheduleOverride" AS o
USING (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "providerId", "date"
           ORDER BY "updatedAt" DESC, "id" DESC
         ) AS rn
  FROM "ScheduleOverride"
) AS ranked
WHERE o."id" = ranked."id"
  AND ranked.rn > 1;

-- 2) Уникальность.
-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOverride_providerId_date_key" ON "ScheduleOverride"("providerId", "date");
