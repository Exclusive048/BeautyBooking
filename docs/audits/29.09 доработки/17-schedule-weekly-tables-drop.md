# 17 · Удаление недельных таблиц расписания

**Источник:** `SCHEDULE-WEEKLY-TABLES-DROP` (BACKLOG), SCHEDULE-PATTERNS-01 · **Тип:** рефакторинг + деструктивная миграция · **Объём:** M
**Зависит от:** деплоя SCHEDULE-PATTERNS-01 с переносом недель на проде (см. «Решения»)

## Что не так

После SCHEDULE-PATTERNS-01 расписание — периоды `SchedulePattern`; `WeeklyScheduleConfig` /
`WeeklyScheduleDay` — история, которую движок читает только у профиля без графика. ⚠️ На 2026-09-29
этапы 1–4 SCHEDULE-PATTERNS-01 **не закоммичены** (`git status`: `prisma/schema/schedule.prisma`,
`scripts/post-deploy.ts` изменены; в `HEAD:scripts/post-deploy.ts` нет `backfillWeeklySchedulePatterns`),
то есть перенос недель на проде ещё не выполнялся ни разу.

**🔴 Найден дефект запасного пути — чинить до первого деплоя графиков.** `assembleScheduleContext`
выбирает неделю, если в списке периодов пусто (`lib/schedule/engine-context.ts:572-576`), а список
приходит уже отфильтрованным по диапазону дат (`patternRangeWhere`, `:199-209`; диапазон передают все
вызывающие — `engine.ts:84`, `resolve.ts:79`, `usecases.ts:368, 543`, `available-today.ts:101`,
`free-slot-keys.ts:92`). У перенесённого профиля неделя остаётся в БД навсегда, поэтому после конца
настроенного графика (окно по умолчанию без автопродления, `planPeriodWrite` без `resumePrevious`
после конца ничего не хранит — `patterns.ts:115-131`) движок для дат после конца **снова отдаёт
старую неделю**: окошки, «свободно сегодня», фильтр «когда» и запись по ссылке живут, хотя каталог
профиль уже скрыл (`catalog-visibility.ts:77` требует «графиков нет вовсе») и мастер получил
«расписание скоро закончится». Решение владельца «расписание действует ровно до настроенной даты»
нарушено. На dev-БД пока не проявляется: 82 недели, у всех 82 профилей есть график, ни у кого все
графики не кончились.

**Кто читает и пишет недельные таблицы** (греп 2026-09-29, без тестов):
- движок: `engine-context.ts:85` (`WEEKLY_DAY_SELECT`), `:184-197` `buildLegacyWeekPeriod`, `:284`
  агрегат в версии расписания, `:382` чтение, `:466` пакетное чтение, `:493, 515, 546, 572-576`;
  тип источника `"weekly-legacy"` — `engine-core.ts:17`, `resolve.ts:16`, `rule-engine.ts:31`;
- графики: `patterns.ts:69` (шаблон «не используется» — `weeklyScheduleDays: { none: {} }`),
  `:312, 361-429` `readWeekRepresentation` (ветка `legacy`), `:558, 567-609` сводка (`hasLegacyWeek`,
  палитра), вызовы `ensurePatternHistoryTx` `:271, 287, 477` и `calendar.ts:303`;
  `patterns-core.ts:196-243` `ensurePatternHistoryTx`, `:254-270` `backfillWeeklySchedulePatterns`;
  `calendar.ts:431-436` (день палитры «в работе», если на него ссылается неделя);
- каталог: `providers/catalog-visibility.ts:33-37` `WORKING_WEEK_WHERE`, `:77` третья ветка;
- **писатель**: `studios/master-profile-split.ts:529-555` `copyProviderScheduleTx` создаёт неделю
  новому профилю в студии, `:471` проверка недели у заготовки (контекст §4 «писать её больше некому» —
  неверно);
- удаление: `deletion/delete-master.ts:93, 181`, `delete-studio.ts:146`,
  `provider-data-disposition.ts:76` (DMMF-сторож инв. #38 потребует убрать запись вместе со связью);
- пост-деплой: `scripts/post-deploy.ts:39, 77`; сиды: `seed-providers.ts:301-313`,
  `seed-showcase-master.ts:354-372`, `seed-showcase-studio.ts:654-664`, `index.ts:107, 159-162`,
  `reset.ts:15-19`;
- сторожа и инструменты: реестр `schedule/day-plans-readers.test.ts:31-32, 43`;
  `scripts/check-include-where.mjs:67` («days» оставить — это и `SchedulePattern.days`);
- тесты (11): `personal-booking-cell`, `delete-cabinets`, `bookable-window-operator`,
  `day-plans-readers`, `day-plans`, `editor-atomicity`, `override-order`,
  `patterns-backfill-equivalence`, `reschedule-self-slot`, `schedule-version-inputs`, `slots-db-cost`;
- устаревшие комментарии: `hours-tab.tsx:55`, `week-occupancy.ts:20, 50`, `policy-enforcement.ts:281`,
  `studio/bookings.service.ts:38`, `cabinet/studio/schedule/settings/page.tsx:35`,
  `schedule-version-cache.ts:7`, `editor.ts:52, 528`;
- схема: `prisma/schema/schedule.prisma:3-36`, связи `provider.prisma:149`, `schedule.prisma:71`;
- QA: `.qa/snapshots/post-seed.dump` (восстановит таблицы), `.qa/diagnostics/schedule-patterns/restore.ts`.

## Что сделать

**Этап 0 — сразу, до первого деплоя графиков (не деструктивно).** ✅ Сделан в спеке 00, п. 2 (2026-09-29): вместо дополнительного запроса периоды профиля читаются все и фильтруются по диапазону в памяти (`patternOverlapsRange`), признак «график есть вообще» — `hasAnyPattern`; тесты в `schedule/day-plans.test.ts`. Запасной путь — только для профиля
без графиков ВООБЩЕ: одиночный путь — `schedulePattern.findFirst({ where: { providerId }, select: { id } })`,
когда отфильтрованный список пуст; пакетный — `groupBy providerId` по тем же id. Тест на
`assembleScheduleContext`: график кончился вчера, неделя есть → день после конца выходной; до фикса —
рабочий (репродукция).

**Этап A — код без недельных таблиц (таблицы остаются).** Деплой после проверки 1 ниже.
Снять всё чтение и запись из списка выше: запасной путь движка и агрегат версии (формат версии
сменится — кэш дней и окошек один раз холодный), ветку `legacy` в `readWeekRepresentation` и сводке,
`ensurePatternHistoryTx` и его вызовы, `backfillWeeklySchedulePatterns` в `post-deploy` и сидах,
третью ветку каталога, копию недели в `copyProviderScheduleTx`, удаление недель в `delete-*`;
`"weekly-legacy"` из союза типов. Сиды пишут графики сразу (`createPeriodTx` из `patterns-core.ts`,
как делал перенос). Реестр `day-plans-readers.test.ts`: убрать недельные имена из шаблона и снять
пояснение у `catalog-visibility.ts`.

**Этап B — миграция, отдельным деплоем после этапа A.** Схема: удалить обе модели и две связи.
`npm run migrate:new -- --name drop_weekly_schedule_tables`, SQL прочитать целиком до применения
(rule 16): ожидаются только снятие внешних ключей `WeeklyScheduleConfig_providerId_fkey`,
`WeeklyScheduleDay_configId_fkey`, `WeeklyScheduleDay_templateId_fkey` и два `DROP TABLE`; любой
посторонний `DROP` (ловушка hnsw) — убрать, его ловит `check:migration-drops`. На dev история до
сквоша, `migrate dev` там не проходит — SQL получить `prisma migrate diff --from-migrations
prisma/schema/migrations --to-schema-datamodel prisma/schema --shadow-database-url <временная пустая БД>
--script` (или написать руками по ожидаемому списку), на dev применить через `psql`.

**Предусловия этапа B на проде (всё только чтение, результат — в отчёт):**

```sql
BEGIN READ ONLY;
-- 1. неделя с рабочими днями у профиля без графика — ОБЯЗАНО быть 0
SELECT count(*) FROM "WeeklyScheduleConfig" w
WHERE NOT EXISTS (SELECT 1 FROM "SchedulePattern" p WHERE p."providerId" = w."providerId")
  AND EXISTS (SELECT 1 FROM "WeeklyScheduleDay" d WHERE d."configId" = w.id AND d."isActive" AND d."templateId" IS NOT NULL);
-- 2. справочно: любая неделя без графика; все графики профиля кончились, а неделя есть
SELECT count(*) FROM "WeeklyScheduleConfig" w
WHERE NOT EXISTS (SELECT 1 FROM "SchedulePattern" p WHERE p."providerId" = w."providerId");
SELECT count(*) FROM "WeeklyScheduleConfig" w
WHERE EXISTS (SELECT 1 FROM "SchedulePattern" p WHERE p."providerId" = w."providerId")
  AND NOT EXISTS (SELECT 1 FROM "SchedulePattern" p WHERE p."providerId" = w."providerId"
    AND (p."endsOn" IS NULL OR p."endsOn" >= to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')));
-- 3. справочно: шаблоны, на которые ссылается только неделя (после дропа станут «не используются»)
SELECT count(*) FROM "ScheduleTemplate" t
WHERE EXISTS (SELECT 1 FROM "WeeklyScheduleDay" d WHERE d."templateId" = t.id)
  AND NOT EXISTS (SELECT 1 FROM "SchedulePatternDay" pd WHERE pd."templateId" = t.id)
  AND NOT EXISTS (SELECT 1 FROM "ScheduleOverride" o WHERE o."templateId" = t.id);
ROLLBACK;
```

Dev-БД 2026-09-29: 0 / 0 / 0 / 0 (82 недели, 574 дня, у всех 82 профилей есть график). Проверку 1
прогнать дважды: перед деплоем этапа A и перед этапом B. Затем: отдельный снимок двух таблиц
(`pg_dump -Fc -t '"WeeklyScheduleConfig"' -t '"WeeklyScheduleDay"'`) вне ротации семи снимков
`deploy.yml`, **явное согласие владельца**, и только потом деплой с миграцией. Автооткат `deploy.yml`
возвращает образ `:previous` — им обязан быть образ этапа A, который таблиц не касается; иначе откат
после дропа падает на первом чтении недели.

## Решения владельца

1. **Согласие на применение миграции на проде** — обязательно, после отчёта с результатами проверок
   1–3 и подтверждённого снимка. Без него этап B не выполняется.
2. Хранить ли снимок двух таблиц дольше ротации? Рекомендую да (архив на 90 дней): история недель уже
   перенесена в графики, но снимок — единственный способ сверить перенос задним числом.

## Готово, когда

- Этап 0: после конца графика дни закрыты и у перенесённого профиля (тест + живая проверка).
- Этап A: в `src/`, сидах и `scripts/` нет обращений к недельным моделям; `npm run seed:test` на чистой
  базе даёт те же окошки, что до этапа (сверка `patterns-backfill-equivalence` переписана на графики).
- Этап B: таблиц нет на dev и проде, `check:schema-drift` зелёный, `.qa/snapshots/post-seed.dump`
  пересобран.

## Проверка

- Этап 0: тест-репродукция краснеет до фикса; пакетный путь — тот же сценарий через
  `createScheduleContexts`.
- Этап A: тесты расписания, каталога, удаления и разделения профилей; `day-plans-readers.test.ts` с
  пробой (вернуть чтение недели в любой файл вне `lib/schedule/` → красный); DMMF-сторож инв. #38 на
  этапе B краснеет на оставленной записи `weeklyScheduleConfig` — это проба, что он видит удаление.
- Гейты: `typecheck`, `lint`, `check:encoding`, `check:mojibake`, `npx prisma validate && npx prisma
  generate`, `check:schema-drift`, `check:migration-drops`.
- Живая: Анна — вкладки «Часы» и «Календарь», пошаговое окно; админ Vision — «График команды»,
  расписание мастера; публичная страница — окошки; каталог — присутствие; ПК и телефон.

## Документы

- BACKLOG — удалить пункт; BACKLOG-DONE — строка на каждый этап.
- Контекст (миграция схемы, rule 15): §4 — модели 71 → 69, счётчик миграций, убрать «`WeeklyScheduleConfig`
  у профиля с графиком — история»; §5 «Расписание» — упоминания недели; §12 инв. #47 — «неделя — только у
  профиля без графика» убрать; §2 CI/CD — из `deploy:post` уходит перенос недель.
- DEPLOY-BACKLOG — пункт с проверками 1–3, снимком, порядком «этап A → этап B» и согласием владельца.
- `docs/audits/SCHEDULE-PATTERNS-01.md` — отметить закрытие хвоста.

## Риски

- Деструктивно: откат данных — только восстановление снимка (теряется всё, записанное после).
- Проверка 1 ≠ 0 на проде (перенос упал на профиле): этап B не начинать, разобрать `failed` из вывода
  `deploy:post`.
- Этап 0 нельзя откладывать до этапа B: дефект проявится у первого же мастера, чей график кончится.
