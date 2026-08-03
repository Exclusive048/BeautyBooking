# МастерРядом

Маркетплейс онлайн-записи к бьюти-мастерам. Next.js 16, Prisma 6, PostgreSQL, Redis, TypeScript strict.

## Контекст проекта

@MASTERRYADOM_AI_CONTEXT.md

## Команды

Все скрипты — в `package.json`. Неочевидное: `npm run worker` — отдельный процесс (воркер очереди), `npm run check` — полная проверка (lint + types + prisma + encoding + mojibake + ui-text + schema-drift).

## Дизайн

При любой работе с UI, страницами, компонентами и стилями — ВСЕГДА сначала вызывай скилл `ui-ux-pro-max` (`.claude/skills/ui-ux-pro-max/SKILL.md`) и следуй его инструкциям. Он загружается по требованию — не читай файл вручную, вызывай скилл.

## Архитектура

Раскладка каталогов выводится из `ls src/`. Здесь — только то, что из структуры не видно:

- `src/components/layout/app-shell-content.tsx` — global wrapper, выбирает full-width vs constrained по pathname
- `src/lib/ui/text.ts` — **ЕДИНСТВЕННЫЙ** источник всех UI-текстов (`UI_TEXT`)
- `src/lib/schedule/editor.ts` (server-only) и `src/lib/schedule/editor-shared.ts` (client-safe) — граница для типов/нормализаторов расписания
- `.claude/references/` — design references (`{page}.png` + `{page}.js`) для каждой страницы

## ВАЖНЫЕ ПРАВИЛА

1. **UI-тексты** — ВСЕ строки только через `UI_TEXT` из `src/lib/ui/text.ts`. Хардкод запрещён.
2. **Логирование** — `logInfo()` / `logError()` из `src/lib/logging/logger.ts`. НЕ console.log.
3. **API ответы** — `ok()` / `fail()` из `src/lib/api/response.ts`. Валидация через Zod.
4. **Auth** — `requireAuth()` / `getSessionUser(req)` из `src/lib/auth/guards.ts`.
5. **Расписание** — только через `ScheduleEngine` / `editor.ts`, не напрямую через Prisma. Инвалидация кэша обязательна.
6. **Prisma v6** — не обновлять до v7 без согласования.
7. **Next.js 16** — params в API route это Promise: `const { id } = await ctx.params`.
8. **Время** — всё в UTC (`startAtUtc`, `endAtUtc`). Локальное только для отображения.
9. **OTP в логах** — оставить как есть (нужно для тестирования на текущей стадии).
10. **Rate limiting** — на все мутирующие/чувствительные эндпоинты. Sensitive routes = fail-closed при Redis outage.
11. **Переменные окружения** — ТОЛЬКО через `env` из `src/lib/env.ts`. `process.env.*` напрямую запрещён везде кроме: самого `env.ts`, файлов Prisma (`prisma.ts`, `prisma-direct.ts`), тестовых файлов (`*.test.ts`), `src/lib/startup.ts`, `src/proxy.ts` (middleware-class файл; в Next 16 переименован из `src/middleware.ts` — legit usage сохранён) и `src/instrumentation.ts` (**только `process.env.NEXT_RUNTIME`** — build-time литерал, который Next инлайнит per-runtime; именно на нём держится dead-code-elimination edge-ветки, без него `@sentry/node` затягивается в edge-бандл и билд падает. Все остальные env в instrumentation — через `env.ts`). Computed flags (`isPushEnabled`, `isPaymentsEnabled` и пр.) — из того же модуля.
12. **Нет внутренних ID в публичных API** — CUID/внутренние `id` нельзя возвращать в ответах публичных эндпоинтов (`/api/public/*`, `/api/catalog/*`, `/models/*` и т.п.). Использовать только `publicUsername`, `publicCode` или аналогичные непредсказуемые публичные идентификаторы. Курсоры пагинации кодировать через `encodeCursor` (base64url). Исключения (где `id` допустим): внутренние кабинеты (`/cabinet/*`), admin-панель, booking-флоу где `id` нужен клиенту для последующих запросов.
13. **Server/Client import boundary** — client components (`"use client"`) никогда транзитивно не импортируют server-only модули (Prisma, Redis, fs, Node API). Webpack тянет полный module graph в browser bundle и роняет build с ошибкой типа `Module not found: 'net'`. Для типов — `import type`. Runtime helpers нужные клиенту — выносить в `*-shared.ts` без server-only зависимостей (см. `src/lib/schedule/editor-shared.ts` как образец). Подробности и watch-chains — в `docs/QUALITY-GATES.md`.
14. **Reference-driven редизайн** — design references лежат в `.claude/references/{page}.png` + `{page}.js`. Перед редизайн-коммитом: `view` reference, сравнение existing code vs reference, gap-analysis, complexity-assessment, scope-decision (что в commit, что defer). Только после этого — план и реализация.
15. **Контекст-дисциплина (уточнено CONTEXT-REFRESH-V3, 2026-08-03)** — `MASTERRYADOM_AI_CONTEXT.md` редактируется ТОЛЬКО при структурных триггерах (schema/routes/env/core-flows — таблица в `docs/QUALITY-GATES.md`, раздел «📚 Обновление контекста»), рутинные коммиты файл не трогают. **🚨 Но если триггер сработал — правка делается В ТОМ ЖЕ изменении, тем же агентом, а не откладывается.** Секция `### Context updates` в отчёте — это **перечень уже применённых фактов**, а не список намерений на будущее. Причина конкретная: волна из 9 коммитов (AUTH-GATE-01 … RKN-FIX-12) отчитывалась «context updates» в каждом отчёте, а в файл не попало почти ничего — снапшот остался в состоянии «до RKN» (30 протухших маркеров «pending commit», инварианты кончались на 34, `PHONE_AUTH_ENABLED` отсутствовал). Отчёт фиксировал намерение, диск — ничего. **Проверка при рефреше — грепом по маркерам в файле, никогда по отчётам и никогда по commit-message'ам** (сообщение коммита `3d302bf` анонсировало инвариант #36 и правку этого самого правила — в диффе не было ни того, ни другого). Выполненный пункт бэклога: удалить из `BACKLOG.md` + дописать одну строку в `BACKLOG-DONE.md` (append-only), тоже в том же изменении. **Deploy/ops-пункты в `BACKLOG.md` не заводятся** — они идут в `DEPLOY-BACKLOG.md` (BACKLOG-TRIAGE-01): это отдельный handoff-документ для DevOps, и продуктовый бэклог не должен быть местом, где операционные шаги теряются среди код-задач. Раз в 4-6 коммитов (или ~2 недели) — полный CONTEXT-REFRESH отдельным коммитом.
16. **Schema discipline (MIGRATION-RECONCILIATION 2026-05-30)** — изменения `prisma/schema/*.prisma` идут ТОЛЬКО через `npx prisma migrate dev --name <descriptive>`. Production deploy использует `npx prisma migrate deploy`. **🚨 `prisma db push` ЗАПРЕЩЁН** — обходит migration history → silent schema drift → production runtime crashes (проект попал в 24-операционный drift в мае 2026, blocked launch до reconciliation). `prisma migrate reset` — dev-only (запрещён в production paths). Migration files (`prisma/schema/migrations/*`) versioned, audited, immutable once committed. **Drift detection через `npm run check:schema-drift`** (CI-enforced gate, добавлен 2026-05-30). **Если случайно `db push` произошёл:** stop → `npx prisma migrate diff --from-migrations prisma/schema/migrations --to-schema-datamodel prisma/schema --shadow-database-url ... --script` чтобы увидеть drift → один reconciliation migration через `migrate dev` → manual review SQL → apply.
17. **Timezone-источник (SKILL-TZ-01 2026-07-06)** — любая новая поверхность отображения времени обязана указать tz-источник (**salon-tz** / **viewer-tz** / **UTC-tech**) в коде и в отчёте. Время записи/слота/расписания → salon-tz с меткой (`formatLocalHm` / `UI_FMT.*({timeZone})` + `formatZoneLabel`), никогда сырой `toLocale*`/`getHours()`. Ориентир — skill `.claude/skills/timezone-correctness/SKILL.md` (каноническая таблица) + `npm run check:tz` (review-aid).

## Стиль кода

- Файлы: kebab-case. Компоненты: PascalCase.
- Импорты: `@/` = `src/`
- Ошибки: `AppError` из `src/lib/api/errors.ts`
- CTA-кнопки: глагол в инфинитиве («Сохранить», «Записаться»). **Исключение — подтверждение информационного уведомления** («Понятно» в cookie-баннере): это не действие над продуктом, а «прочитал». Инфинитив здесь либо врёт про действие («Закрыть»), либо возвращает фиктивное согласие («Принять») — см. RKN-FIX-06.
- Тексты ошибок: «Не удалось {действие}. Попробуйте ещё раз.»
- Только shared UI-компоненты (Button, Card, Input, Select, Textarea, Tabs, Switch, Badge)
- Только Tailwind-токены, никаких inline-цветов

## Проверки после каждого изменения

```bash
npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake
```

Если затронута Prisma-схема: `npx prisma validate && npx prisma generate`

## Качество — чеклист

Перед коммитом — скилл `quality-gates` (загружается по требованию). Канонический документ — `docs/QUALITY-GATES.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
