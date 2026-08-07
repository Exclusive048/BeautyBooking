# 08-QUALITY-GATES: Чеклист при каждом изменении кода

> Этот файл — обязательное приложение к КАЖДОМУ промпту для ИИ при работе с кодом МастерРядом.
> Вставляй его вместе с MASTERRYADOM_AI_CONTEXT.md и промптом задачи.
>
> **Companion doc:** [`SPRINT-PATTERNS.md`](./SPRINT-PATTERNS.md) — meta-lessons synthesized from the 16-fix-wave + 5-audit redesign sprint. Consult **before designing a fix** (audit-first, trace parallel channels, redesign-commit checklist, defense-layering, etc). This file covers **per-commit checks**; SPRINT-PATTERNS covers **how-we-work**.

---

## ПЕРЕД ИЗМЕНЕНИЯМИ

1. **Проверить текущий функционал**
   - Как сейчас работает затрагиваемый код
   - Какие модули/компоненты используют изменяемые файлы
   - Есть ли тесты для затрагиваемого кода

2. **Найти все usage**
   - `grep -rn "import.*ИмяКомпонента" src/`
   - Проверить влияние на другие части системы
   - Не менять в одном месте, если это ломает глобально

---

## ПРИ ИЗМЕНЕНИЯХ

### UI-тексты
- [ ] ВСЕ пользовательские строки — из `UI_TEXT` (`src/lib/ui/text.ts`)
- [ ] Новые тексты: добавить в `UI_TEXT`, писать на русском, UTF-8
- [ ] CTA = глагол: «Сохранить», «Удалить», «Записаться» (допустимо: «Применить фильтры»)
- [ ] Ошибки: «Не удалось {действие}. Попробуйте ещё раз.»
- [ ] Empty states: 1 фраза + 1 кнопка-действие

### Кодировка
- [ ] Файлы в UTF-8 без BOM
- [ ] Нет mojibake/битых символов

### Design system
- [ ] Только shared-компоненты: Button, Card, Input, Select, Textarea, Tabs, Switch, Badge
- [ ] Нет inline-цветов (`#fff`, `rgb(`)
- [ ] Нет `<button` без shared Button (кроме Radix primitives)
- [ ] Только Tailwind-токены для стилей

### Логика
- [ ] Бизнес-логика не зависит от текстовых строк (только enum, boolean, числа)
- [ ] Серверный код не в клиентском бандле
- [ ] `process.env.SECRET_*` только в серверных файлах

### Безопасность
- [ ] Мутирующие API за rate limiting
- [ ] Валидация входных данных через Zod
- [ ] Нет логирования секретов (кроме OTP — оставлено для тестирования)
- [ ] Auth проверяется через `requireAuth()` / `getSessionUser()`

### Расписание (если затронуто)
- [ ] Изменения через `ScheduleEngine` / `editor.ts`, не напрямую через Prisma
- [ ] Инвалидация кэша после изменений

### Prisma (если затронута схема)
- [ ] `npx prisma validate`
- [ ] `npx prisma generate`
- [ ] Миграция через `--create-only`

### Чистота
- [ ] Нет `console.log/debug/warn/info` (использовать `logInfo()` / `logError()`)
- [ ] Нет неиспользуемых импортов
- [ ] Нет закомментированного кода
- [ ] Нет `any` без обоснования

### UTF-8 + Windows PowerShell editing
- [ ] При редактировании UTF-8 файлов на Windows PowerShell использовать `[System.IO.File]::ReadAllText` / `WriteAllText` с `UTF8Encoding($false)` (без BOM)
- [ ] **НЕ использовать** `Get-Content` / `Set-Content` cmdlets — они либо ломают русский текст через codepage conversion, либо записывают BOM, что вызывает mojibake и ломает `npm run check:encoding` / `check:mojibake`
- [ ] Если используешь `Out-File` — обязательно `-Encoding utf8 -NoNewline` (а лучше `[IO.File]::WriteAllText`)
- [ ] Все новые файлы с русскими строками (особенно `UI_TEXT`) — открыть в hex-viewer или `file -i` после правки, убедиться что нет `EF BB BF` префикса

### Server/Client import boundary
- [ ] Client components (`"use client"`) **никогда** не импортируют server-only модули — ни напрямую, ни транзитивно (Prisma, Redis, fs, Node API типа `net`/`crypto`/`dns`)
- [ ] Для типов из server модулей — только `import type { Foo } from "..."` (стирается на compile-time)
- [ ] Runtime helpers/constants/normalizers нужные клиенту — выносить в `*-shared.ts` без server-only зависимостей. Образец: `src/lib/schedule/editor-shared.ts` (client-safe) ↔ `src/lib/schedule/editor.ts` (server-only с Prisma + Redis)
- [ ] Watch chains, которые тащат Redis в клиент: `editor.ts → slotsCache.ts → cache.ts → redisClient.ts → @redis/client`. Один `import { runtimeValue }` (не type) из такого модуля в client компонент роняет build
- [ ] Сигнал нарушения границы — ошибка `Module not found: Can't resolve 'net'` (или `'fs'`, `'tls'`) во время `npm run build`

### RSC serialization
- [ ] Server Components **никогда** не передают React-компоненты или функции в Client Components как props — они не сериализуются через RSC boundary
- [ ] Pattern для иконок и других компонентов: string identifier (union тип) + lookup map. Образец: `src/features/marketing/icons/feature-icons.ts` мапит `FeatureIconName` → lucide компоненты
- [ ] Через границу проходят только сериализуемые данные: plain objects, arrays, primitives, Date, null. Нельзя: Map, Set, Symbol, classes, функции, JSX

### Reference comparison (для редизайн-коммитов)
- [ ] Если есть `.claude/references/{page}.png` или `.claude/references/{page}.js` — прочитать **до** начала работы
- [ ] Audit-фаза должна включать: (1) какие фичи в reference уже реализованы, (2) что отсутствует, (3) сложность каждой (simple/medium/complex), (4) scope decision — что в текущий commit, что defer на следующий
- [ ] Не начинать имплементацию пока gap analysis + scope не записаны в плане
- [ ] Если reference противоречит существующим инвариантам или backend-возможностям — флагать и спрашивать решения, не «угадывать»

### Behaviour-level audit (для visual / positioning bug fixes)
- [ ] Не останавливаться на file-level проверке («использует ли компонент Х?») — проверять **rendered behaviour**: где элемент реально живёт в DOM, какие ancestors у него, что у них в computed CSS
- [ ] Для bugs с `position: fixed` (модалки, drawer, popover): проверить ancestor chain от мест монтирования до root на наличие `transform`, `filter`, `backdrop-filter`, `will-change`, `contain`, `perspective` — любое из этих свойств создаёт **containing block** для fixed-descendant и ломает viewport-anchoring
- [ ] Для bugs повторяющихся 2+ раза: предыдущий audit gave wrong verdict. Не повторять тот же подход — менять метод (если file-level не нашло → переходить к DOM ancestry trace; если static не нашло → DevTools на реальном environment)
- [ ] Документировать ограничения аудита: «что не доказано из кода» (например, browser-specific quirks, runtime-only behaviours). Pragmatic fixes лучше confident wrong root cause — см. `modals-investigation` коммит как пример (Portal-to-body fix addressed all 8 hypotheses simultaneously without needing to prove which one was real)
- [ ] **Детерминированный 100 %-провал — не гонка: сначала проверь пробу/инструмент, потом продукт.** Гонка даёт разброс; «50 из 50» и «каждый раз ровно на этом шаге» — почерк измерения, а не продукта. Дважды за один день: QA-003 (2026-08-03) «50/50 провалов» оказался 21-секундным SMTP-таймаутом против 12-секундного ожидания пробы; BOOKING-TIME-COLUMNS-01 (2026-08-03) «сдвиг на 6 часов в каждой строке» оказался одинарным `AT TIME ZONE` по `timestamp without time zone` (интерпретация вместо конверсии — нужны ОБА шага: `("ts" at time zone 'UTC') at time zone '<salon>'`). Прежде чем чинить продукт — воспроизведи ожидаемое значение независимым способом.
- [ ] Modal positioning: ВСЕГДА через `ModalSurface` (использует `createPortal` к `document.body`). Любой `fixed inset-0 z-...` outside `ModalSurface`, drawer или bottom-sheet primitive — нарушение convention. **✅ ESLint-гейт построен (GUARDRAILS-01 2026-07-06):** `no-restricted-syntax` warn-rule в `eslint.config.mjs` флагает `fixed inset-0` / `fixed top-0 left-0 right-0 bottom-0` в `.tsx`; exempt-list (2 primitives + 4 nav-backdrops + 2 click-catchers) документирован там же. 5 genuine content-overlay кандидатов (city-prompt / portfolio-editor crop / portfolio-strip lightbox / reviews-preview / stories-viewer) сейчас warn'ят — follow-up на рефактор через `ModalSurface`/`Drawer` (см. BACKLOG.md 🟡).

---

## ПОСЛЕ ИЗМЕНЕНИЙ

### Обязательные проверки
```bash
npm run typecheck
npm run lint
npm run check:encoding
npm run check:mojibake
npm run test        # если затронуты модули с тестами
```

### Если изменена схема
```bash
npx prisma migrate dev --name <descriptive_name>   # обязательно: создаёт миграцию
npx prisma validate
npx prisma generate
npm run check:schema-drift                          # обязательно: drift-гейт
npm run check:migration-drops                       # обязательно: незаявленные DROP
```

> 🚨 **ПРОЧИТАЙТЕ СГЕНЕРИРОВАННЫЙ `migration.sql` ЦЕЛИКОМ, прежде чем применять.**
> `prisma migrate dev` дописывает в **каждую** новую миграцию `DROP INDEX` для
> объектов, которые Prisma не выражает в датамодели (реестр —
> `scripts/raw-sql-objects.mjs`). Такое уже происходило трижды подряд
> (RKN-FIX-12, RKN-FIX-10, RKN-FIX-18), каждый раз строку снимали руками.
> Гейт `check:migration-drops` теперь ловит это в CI, но прочитать файл дешевле,
> чем разбираться с красным CI.
>
> 🚩 **Любой маркер `-- ALLOW-DROP:` в миграции — красный флаг на ревью:
> остановиться и проверить обоснование.** Маркер отключает защиту для
> конкретного объекта в конкретном файле; он законен (осознанный дроп должен
> быть возможен), но по умолчанию его там быть не должно.

> 🚨 **`prisma db push` ЗАПРЕЩЁН** — обходит migration history и вызывает silent schema drift.
> Проект попал на 24-операционный drift в мае 2026 (см. MIGRATION-RECONCILIATION-BATCH).
> Полное правило — `CLAUDE.md` § ВАЖНЫЕ ПРАВИЛА #16.

### check:schema-drift (MIGRATION-RECONCILIATION-BATCH 2026-05-30)

**Назначение:** предотвращает повтор `db push` anti-pattern через CI-enforced gate.

**Триггер:** любой commit меняющий `prisma/schema/*.prisma` (включается в `npm run check`).

**Mechanism:** `prisma migrate diff` сравнивает migrations history vs schema.prisma. Любой non-empty diff = drift = fail.

**Failure recovery:**
1. Запустить `npx prisma migrate diff --from-migrations prisma/schema/migrations --to-schema-datamodel prisma/schema --shadow-database-url "<url>" --script` чтобы увидеть конкретные операции
2. Manual review SQL (no DROP / no destructive expected — sprint discipline ADD-only)
3. Создать миграцию: `mkdir prisma/schema/migrations/<timestamp>_descriptive_name/` + написать `migration.sql` (или использовать interactive `prisma migrate dev` если терминал поддерживает)
4. Apply: `npx prisma migrate deploy` (then commit the migration file)
5. Re-run `npm run check:schema-drift` — должен exit 0

**Local mode:** если Postgres не запущен, скрипт graceful-skips с warning (не блокирует local dev).
**CI mode:** при `CI=true` + Postgres unreachable script fails hard. Currently CI не имеет Postgres service — script запускается в local-skip mode и выдаёт warning в logs. Когда DevOps provisions shadow DB в CI workflow + sets `SHADOW_DATABASE_URL`, gate становится hard-enforcing automatically (no script change needed).

**History:** added 2026-05-30 после MIGRATION-RECONCILIATION discovered 24-операционный sprint-long drift caused by README-instructed `db push`. Structural prevention для drift class.

### check:dead-classes (UI-16 2026-08-07)

**Назначение:** ловит класс, который **компилируется в ничто**. Разметка выглядит правильной, стиля нет, ошибки нет — поэтому все четыре предыдущих рецидива (`shadow-brand` — 7 сайтов, `bg/text-destructive` — 3, точка статуса на `/login`, и 192 сайта из AUDIT-FRESH-05) находились глазами. Остальные гейты его не видят **по своей природе**: `lint` смотрит AST, `typecheck` — типы, `check:ui-text` — русские строки, `check:encoding`/`check:mojibake` — байты; класс-строка для всех них просто строка.

**Механизм:** собирает боевой CSS-бандл настоящим Tailwind (`globals.css` + `tailwind.config.js` + реальный `content`), вытаскивает кандидатов из **строковых литералов** исходников (классы живут в константах `variants`/`sizes`/`cn(...)`, а не только в `className=`), вычитает всё, что бандл сгенерировал, и оставляет то, что действительно класс: первый сегмент совпадает с живым пространством имён либо перечислен в `CUSTOM_NAMESPACES`.

**Почему бандл, а не зонд из утилит:** авторские правила `@layer components` обязаны физически присутствовать в собранном CSS. Иначе удаление `.lux-card` из `globals.css` (ровно то, что случилось в `68c17f9`) гейт бы не заметил — класс числился бы «кастомным, значит легальным».

**Два реестра в `scripts/check-dead-classes.mjs`:**
- `CUSTOM_NAMESPACES` — семейства авторских классов (`lux`, `login`, `map`, `glass`, …). Держат пространство имён живым, даже если из бандла пропало **последнее** правило семейства.
- `NOT_A_CLASS` — строки, которые выглядят классом, но им не являются (CSS-значения инлайновых стилей, директивы `Cache-Control`, ключи localStorage). Пополнять точными значениями и с обоснованием — по образцу `scripts/raw-sql-objects.mjs`.

**Известная граница:** опечатка в самом **варианте** (`hovr:bg-red-500`) не ловится — варианты сверяются с теми, что реально встретились в бандле. Плата принята сознательно: все рецидивы были в имени утилиты, а обратное решение краснело бы на каждом инлайновом стиле.

### Smoke
- [ ] Затронутая страница открывается
- [ ] Нет runtime ошибок в Console
- [ ] UI отображается корректно

---

## 📚 Обновление контекста (правило 15 из CLAUDE.md)

Snapshot `MASTERRYADOM_AI_CONTEXT.md` живёт рядом с кодом и должен отражать реальное состояние. Прошлый раз он ушёл в drift на 2 месяца (`CONTEXT-REFRESH-V2` 2026-05-13 это исправил) — повторять не хочется.

**Куда пишется `### Context updates` (DOCS-LEDGER-01, 2026-07-06):** секция `### Context updates` живёт в **отчёте по коммиту (в чате)**, а НЕ внутри `MASTERRYADOM_AI_CONTEXT.md`. Сам файл снапшота редактируется **только** когда сработал структурный триггер из таблицы ниже. Рутинные UI/refactor/bugfix-коммиты → в отчёте пишем «не затронуто», файл **не редактируем** — это дефолт, а не исключение. (Session-log audit 2026-07-06: bookkeeping-правки составляли 24.5% всех edit-операций — BACKLOG.md 453 + AI_CONTEXT 309; это правило убирает рутинную часть.)

**Выполненные пункты бэклога:** удалить пункт из активного `BACKLOG.md` + дописать **одну строку** в `BACKLOG-DONE.md` (append-only, новое сверху, формат `- YYYY-MM-DD · <область> · <пункт>`). Не держать «Выполнено» в активном файле и не редактировать старые записи ledger'а.

### Триггеры ОБЯЗАТЕЛЬНОГО обновления

| Изменение в коммите | Что обновляется |
|---|---|
| Schema migration (новая модель, поле, enum) | Раздел 4 (Модель данных), Раздел 12 (Инварианты) если появился invariant |
| Новая page route (`src/app/**/page.tsx`) | Раздел 6 (Маршруты) |
| Новая API endpoint group | Раздел 6 + Раздел 5 (Бизнес-логика) если затрагивает core flow |
| Новая env var | Раздел 7 (Переменные окружения) |
| Новый `src/features/*` или `src/lib/*` модуль | Раздел 3 (Архитектура кода) |
| Изменения в auth / RBAC / rate-limit | Раздел 10 (Безопасность) |
| Изменения в core flows (auth, bookings, payments, notifications, schedule) | Раздел 5 |
| Новые dependencies (`package.json`) | Раздел 2 (Тех. стек) |
| Завершение пункта backlog | удалить из активного `BACKLOG.md` + дописать одну строку в `BACKLOG-DONE.md` (append-only) |

### НЕ требуют обновления

- UI redesign без изменения routes/API/schema
- Внутренний рефакторинг компонента
- Исправление багов без изменения структуры
- Изменения в `UI_TEXT` (это deployment detail, не архитектура)
- Тесты (если не значительный объём, ~10+ файлов)

### Формат секции в отчёте

В конце каждого отчёта по коммиту — секция:

```
### Context updates
- MASTERRYADOM_AI_CONTEXT.md:
  - Раздел X — добавлено/изменено: ...
  - Раздел Y — добавлено/изменено: ...
  - (или: «не затронуто, изменения не требуют обновления»)
- BACKLOG.md:
  - (deploy/ops-строки — НЕ сюда, а в `DEPLOY-BACKLOG.md`; см. CLAUDE.md rule 15)
  - Добавлено в категорию X: ...
  - Завершено → удалено из BACKLOG.md, строка дописана в BACKLOG-DONE.md: ...
  - (или: «не затронуто»)
```

### Periodic full refresh

Раз в **4-6 коммитов** (или **~2 недели**) — полный CONTEXT-REFRESH через отдельный коммит (см. `CONTEXT-REFRESH-V2` от 2026-05-13). Цель — пересинхронизировать snapshot со всеми разделами, поскольку даже с per-commit updates неизбежно появляется drift.

Триггеры для запуска CONTEXT-REFRESH:
- Snapshot дата старше 14 дней
- Завершён большой sprint (Cabinet Master, Admin Panel, Public surfaces — каждый достоин refresh при завершении)
- В разговоре с user всплыл факт о коде, который не соответствует snapshot (как было с City моделью)

---

## ОТЧЁТ (обязателен в конце)

```
### Изменения
1. Какие файлы изменены (список)
2. Какие тексты добавлены в UI_TEXT (если были)
3. Где убран хардкод (если был)

### Проверки
- typecheck: ✅/❌
- lint: ✅/❌
- encoding: ✅/❌
- mojibake: ✅/❌
- test: ✅/❌/не затронуты
- prisma validate: ✅/❌/не затронута

### Context updates
- MASTERRYADOM_AI_CONTEXT.md: (см. правило выше)
- BACKLOG.md: (см. правило выше)

### Найденные проблемы
- (если были побочные эффекты или несостыковки)
```
