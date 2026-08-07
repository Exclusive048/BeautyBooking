---
name: quality-gates
description: Чеклист качества для каждого коммита в МастерРядом — что проверить до, во время и после изменения кода, какие команды прогнать, когда обновлять MASTERRYADOM_AI_CONTEXT.md и BACKLOG.md, формат отчёта по коммиту. Используй ВСЕГДА перед коммитом, при подготовке отчёта об изменениях, при вопросах «что проверить», «какие гейты», «чеклист», «quality gates», «отчёт по коммиту», «context updates», «обновить контекст», «schema drift», «check:encoding», «check:mojibake».
---

# Quality Gates — чеклист коммита

Канонический документ — **`docs/QUALITY-GATES.md`**. Прочитай его целиком, когда нужен полный чеклист: секции «ПЕРЕД ИЗМЕНЕНИЯМИ», «ПРИ ИЗМЕНЕНИЯХ» (UI-тексты, кодировка, design system, логика, безопасность, расписание, Prisma, чистота, UTF-8 на Windows PowerShell, server/client boundary, RSC serialization, reference comparison, behaviour-level audit), «ПОСЛЕ ИЗМЕНЕНИЙ», «📚 Обновление контекста» (таблица структурных триггеров) и «ОТЧЁТ».

Companion — `docs/SPRINT-PATTERNS.md` (мета-уроки процесса: audit-first, trace-parallel-channels, redesign-checklist, defense-layering). Читай **до проектирования фикса**.

## Минимум, который надо помнить без чтения файла

```bash
npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake
npm run test        # если затронуты модули с тестами
```

Если затронута Prisma-схема:

```bash
npx prisma migrate dev --name <descriptive_name>   # db push ЗАПРЕЩЁН (CLAUDE.md rule 16)
npx prisma validate && npx prisma generate
npm run check:schema-drift
```

Отчёт по коммиту обязателен и содержит секции: **Изменения** · **Проверки** (typecheck / lint / encoding / mojibake / test / prisma) · **Context updates** (`MASTERRYADOM_AI_CONTEXT.md` + `BACKLOG.md`; по умолчанию «не затронуто») · **Найденные проблемы**. Точный формат — в `docs/QUALITY-GATES.md`, раздел «ОТЧЁТ».
