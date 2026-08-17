-- LOGIC-01 (FIX-A2, фаза 1.4) — ДЕТЕКЦИЯ, НЕ РЕМОНТ. Только чтение.
--
-- Ищет пары пересекающихся живых броней ОДНОГО фактического исполнителя,
-- созданных под РАЗНЫМИ `providerId`. Ровно тот класс строк, который мог
-- появиться, пока предикат конфликта ключевался парой `(providerId,
-- masterProviderId)`: личный профиль мастера и студийный кабинет писали в
-- непересекающиеся множества, поэтому вторая бронь проходила без гонки.
--
-- 🔴 Автопочинка запрещена: это две реальные записи двух живых клиентов.
-- Решение (кого перенести, кого предупредить) принимает человек.
--
-- Скоуп «чей это время» — `COALESCE("masterProviderId", "providerId")`,
-- дословно та же формула, что в `buildConflictScopeWhere`
-- (`src/lib/bookings/booking-core.ts`). Расхождение здесь означало бы, что
-- запрос ищет не то, что защищает приложение.
--
-- ⚠️ Буфер между записями (`Provider.bufferBetweenBookingsMin`) НЕ учитывается:
-- запрос ищет фактическое пересечение, а не нарушение политики буфера, — иначе
-- в выдачу попали бы «слишком плотно, но не внахлёст» пары, которые ремонта не
-- требуют.

WITH live AS (
  SELECT
    b.id,
    b."providerId",
    b."masterProviderId",
    COALESCE(b."masterProviderId", b."providerId") AS master_key,
    b."startAtUtc",
    b."endAtUtc",
    b.status,
    b."clientUserId",
    b."clientPhone"
  FROM "Booking" b
  WHERE b."startAtUtc" IS NOT NULL
    AND b."endAtUtc" IS NOT NULL
    -- живые = те, что занимают время; отменённые/отклонённые/неявка не занимают
    AND b.status NOT IN ('CANCELLED', 'REJECTED', 'NO_SHOW')
)
SELECT
  a.master_key                                   AS master_provider_id,
  a.id                                           AS booking_a,
  a."providerId"                                 AS provider_a,
  a.status                                       AS status_a,
  a."startAtUtc"                                 AS start_a_utc,
  a."endAtUtc"                                   AS end_a_utc,
  bb.id                                          AS booking_b,
  bb."providerId"                                AS provider_b,
  bb.status                                      AS status_b,
  bb."startAtUtc"                                AS start_b_utc,
  bb."endAtUtc"                                  AS end_b_utc
FROM live a
JOIN live bb
  ON bb.master_key = a.master_key
 AND bb.id > a.id                       -- каждая пара один раз
 AND bb."providerId" IS DISTINCT FROM a."providerId"   -- РАЗНЫЕ скоупы — предмет LOGIC-01
 AND bb."startAtUtc" < a."endAtUtc"     -- полуинтервал [start, end): касание концами
 AND bb."endAtUtc"   > a."startAtUtc"   -- пересечением НЕ считается
ORDER BY a.master_key, a."startAtUtc";
