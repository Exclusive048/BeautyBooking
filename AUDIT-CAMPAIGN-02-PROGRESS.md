# AUDIT-CAMPAIGN-02 — ledger

> Старт: **10 августа 2026**. Вход — [`docs/audits/AUDIT-CAMPAIGN-02.md`](docs/audits/AUDIT-CAMPAIGN-02.md) (11 пунктов, все ратифицированы владельцем 2026-08-07), планы/замеры — [`AUDIT-CAMPAIGN-BLOCKED.md`](AUDIT-CAMPAIGN-BLOCKED.md). Непроходимое — в [`AUDIT-CAMPAIGN-02-BLOCKED.md`](AUDIT-CAMPAIGN-02-BLOCKED.md).
>
> **Следующий пункт: 3 (PERF-06 — окно 24 мес в CRM-группировке).**
>
> Исходная точка (2026-08-10, HEAD `6f4eb49f`, чистое дерево): `npm run check` → EXIT=0, `npm run test` → EXIT=0 (260 файлов / 2219 тестов) — вердикт по коду возврата.

| # | Пункт | Статус | Коммиты / примечание |
|---|-------|--------|----------------------|
| 1 | CI-PARITY — гейты в CI | **FIXED** | CI-часть — CI-DEPLOY-NOREGISTRY-01 (`7ac43f4d` ci.yml: 18 шагов поимённо + локстеп-гейт; негативная проба run 31390067413 красная ровно на шаге 11/18 env-discipline). Остаток — `964d74d3`: `migrate:new` (--create-only) канон в rule 16 + QUALITY-GATES; секции check:error-message-lang / check:env-discipline в QUALITY-GATES; протухший абзац schema-drift про «CI без Postgres» приведён к факту; локстеп после правки package.json зелёный (проба). Гейты: check 0 / test 0 (2219) |
| 1b | Реестр контейнеров убран, сборка на ВМ | **FIXED** | `7ac43f4d` (ci.yml), `82858c57` (build-images.yml), `df45e8b5` (deploy.yml + compose + Dockerfile), `c0b68f44` (доки), `f631d08c` (.dockerignore — app-образ не собирался с LOGIC-20, нашёл первый прогон build-images), `6f4eb49f` (замер памяти 5211 MiB в DEPLOY-BACKLOG). Приёмка фактическая: CI run 31391439677 success, Build images run 31391439846 success, Deploy в прогонах отсутствует (workflow_dispatch-only); откат `:previous` проверен симуляцией (tag-до-сборки / retag / prune-безопасность) |
| 2 | SEC-07 — `next-pwa` → `@serwist/next` | **FIXED** | `next-pwa@5.6.0` → `@serwist/next`+`serwist` ^9.5.12; SW-источник `src/app/sw.ts` (4 правила рантайм-кэша и offline-fallback перенесены 1:1; push — по-прежнему `public/sw-push.js` через importScripts); `additionalPrecacheEntries: [/offline]`; старый `public/workbox-*.js` удалён. **Приёмка на прод-артефакте** (standalone + health=200): spec `.qa/diagnostics/sec-07-serwist/sw-offline.spec.ts` зелёный — SW active+controlling (`/sw.js`), `/offline` в прекэше, офлайн-навигация на `/catalog` отдаёт fallback-страницу, после setOffline(false) навигация живая; скриншоты в том же каталоге. Нюанс localhost снят таймлайнами (`sw-diag*.mjs`): первый заход — dev-reset сносит регистрацию (by design), второй — регистрация + clientsClaim + одна controllerchange-перезагрузка (та же механика, что была при next-pwa). `npm audit --omit=dev`: 7 (5 high) → **2 (1 low, 1 moderate)** — цепочка workbox ушла. Диффы доков: снапшот §2, Dockerfile-коммент, .gitignore-коммент, BACKLOG ×2, блок SEC-07 в AUDIT-CAMPAIGN-BLOCKED помечен закрытым |
| 3 | PERF-06 — окно 24 мес в CRM-группировке | PENDING | |
| 4 | PERF-27 — интервал ленты админки 5с → 30с | PENDING | |
| 5 | UI-29 — hit-area в `Button` | PENDING | |
| 6 | UI-22 ч.1 — убрать `text-[9px]` | PENDING | |
| 7 | SEC-04 by-photo — бюджет/тир/дедуп | PENDING | |
| 8 | UI-26 + UI-27 — сырые `<button>` + `dark:` по областям | PENDING | |
| 9 | PERF-12 — LazyMotion вариант (б) | PENDING | |
| 10 | PERF-03 + PERF-02 — env-схема + сплит UI_TEXT | PENDING | |
| 11 | Чат-пагинация (остаток PERF-22) | PENDING | |
