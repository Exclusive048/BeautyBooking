# МастерРядом

Маркетплейс онлайн-записи к бьюти-мастерам. Next.js 16, Prisma 6, PostgreSQL, Redis, TypeScript strict.

## Контекст проекта

@MASTERRYADOM_AI_CONTEXT.md

## Команды

- `npm run dev` — dev server
- `npm run worker` — воркер очереди задач (отдельный процесс)
- `npm run test` — Vitest
- `npm run typecheck` — проверка типов
- `npm run lint` — ESLint
- `npm run check` — полная проверка (lint + types + prisma + encoding + mojibake + ui-text)
- `npm run build` — production build
- `npx prisma validate` — валидация схемы
- `npx prisma generate` — генерация клиента

## Дизайн

При любой работе с UI, страницами, компонентами и стилями — ВСЕГДА сначала читай @.claude/skills/ui-ux-pro-max/SKILL.md и следуй его инструкциям.

## Архитектура

- `src/app/` — Next.js App Router (pages + API routes)
- `src/lib/` — бизнес-логика (домены: schedule, bookings, billing, auth, notifications, queue)
- `src/features/` — UI по фичам
- `src/features/master/components/{dashboard,bookings,schedule,schedule-settings}/` — кабинет мастера, переписан в текущем sprint
- `src/components/ui/` — shared UI-компоненты
- `src/components/layout/app-shell-content.tsx` — global wrapper, выбирает full-width vs constrained по pathname
- `src/lib/ui/text.ts` — **ЕДИНСТВЕННЫЙ** источник всех UI-текстов (`UI_TEXT`)
- `src/lib/schedule/editor.ts` (server-only) и `src/lib/schedule/editor-shared.ts` (client-safe) — граница для типов/нормализаторов расписания
- `.claude/references/` — design references (`{page}.png` + `{page}.js`) для каждой страницы
- `src/worker.ts` — воркер очереди задач
- `prisma/schema/` — модель данных (split на несколько файлов)

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
11. **Переменные окружения** — ТОЛЬКО через `env` из `src/lib/env.ts`. `process.env.*` напрямую запрещён везде кроме: самого `env.ts`, файлов Prisma (`prisma.ts`, `prisma-direct.ts`), тестовых файлов (`*.test.ts`), `src/lib/startup.ts`, и `src/middleware.ts`. Computed flags (`isPushEnabled`, `isPaymentsEnabled` и пр.) — из того же модуля.
12. **Нет внутренних ID в публичных API** — CUID/внутренние `id` нельзя возвращать в ответах публичных эндпоинтов (`/api/public/*`, `/api/catalog/*`, `/models/*` и т.п.). Использовать только `publicUsername`, `publicCode` или аналогичные непредсказуемые публичные идентификаторы. Курсоры пагинации кодировать через `encodeCursor` (base64url). Исключения (где `id` допустим): внутренние кабинеты (`/cabinet/*`), admin-панель, booking-флоу где `id` нужен клиенту для последующих запросов.
13. **Server/Client import boundary** — client components (`"use client"`) никогда транзитивно не импортируют server-only модули (Prisma, Redis, fs, Node API). Webpack тянет полный module graph в browser bundle и роняет build с ошибкой типа `Module not found: 'net'`. Для типов — `import type`. Runtime helpers нужные клиенту — выносить в `*-shared.ts` без server-only зависимостей (см. `src/lib/schedule/editor-shared.ts` как образец). Подробности и watch-chains — в `docs/QUALITY-GATES.md`.
14. **Reference-driven редизайн** — design references лежат в `.claude/references/{page}.png` + `{page}.js`. Перед редизайн-коммитом: `view` reference, сравнение existing code vs reference, gap-analysis, complexity-assessment, scope-decision (что в commit, что defer). Только после этого — план и реализация.
15. **Контекст-снапшот обновляется после каждого структурного изменения** — `MASTERRYADOM_AI_CONTEXT.md` и `BACKLOG.md` должны отражать реальное состояние репо. Триггеры обязательного обновления и формат — в `docs/QUALITY-GATES.md` (раздел «📚 Обновление контекста»). Каждый отчёт по коммиту обязан содержать секцию `### Context updates`. Раз в 4-6 коммитов (или ~2 недели) — полный CONTEXT-REFRESH через отдельный коммит.

## Стиль кода

- Файлы: kebab-case. Компоненты: PascalCase.
- Импорты: `@/` = `src/`
- Ошибки: `AppError` из `src/lib/api/errors.ts`
- CTA-кнопки: глагол в инфинитиве («Сохранить», «Записаться»)
- Тексты ошибок: «Не удалось {действие}. Попробуйте ещё раз.»
- Только shared UI-компоненты (Button, Card, Input, Select, Textarea, Tabs, Switch, Badge)
- Только Tailwind-токены, никаких inline-цветов

## Проверки после каждого изменения

```bash
npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake
```

Если затронута Prisma-схема: `npx prisma validate && npx prisma generate`

## Качество — чеклист

@docs/QUALITY-GATES.md
