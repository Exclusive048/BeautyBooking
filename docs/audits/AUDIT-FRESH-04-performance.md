# AUDIT-FRESH-04 — Производительность — Отчёт

> Дата: **4 августа 2026** · Ветка: `main`, чистое рабочее дерево (`git status` clean на момент старта, HEAD `5a37b0a`).
> Аудит «свежим взглядом» перед запуском. Область: страницы, клиентский бандл, БД, кэш, медиа.
> Отчёт **read-only** — ни один исходник не изменён. Записи на диск: `.next/` (две сборки), этот файл — и один побочный эффект, о котором надо знать.

> ### ⚠️ Побочный эффект сборки: `public/sw.js`
> `next-pwa` сконфигурирован с `dest: "public"` (`next.config.ts:7`), поэтому `npm run build` перезаписывает **отслеживаемый git'ом** `public/sw.js` — в нём меняется precache-манифест с хешами чанков. Файл после моих двух сборок числится изменённым (`git diff --stat public/sw.js` → 1 строка). Это **не** правка исходника: артефакт детерминированный, любая следующая сборка перегенерирует его заново. Восстанавливается одной командой владельца: `git checkout -- public/sw.js`. Сам я его не откатывал — правила аудита запрещают мутирующие git-команды.
>
> Прочие изменённые/непроиндексированные файлы в `git status` на момент сдачи (`BACKLOG.md`, `MASTERRYADOM_AI_CONTEXT.md`, `src/**`, `.tmp-audit/`, `openapi/`) — **не мои**: параллельно идут ещё четыре аудита. Мой единственный созданный файл — этот отчёт (`docs/*` в `.gitignore:62`, как и остальные три отчёта волны).

---

## Метод

### Что прогнано

| Команда | Назначение | Результат |
|---|---|---|
| `npm run build` (`next build --webpack`) | таблица роутов, артефакты сборки | ✅ exit 0, «Compiled successfully in 26.9s», 241 страница сгенерирована, **381 запись в таблице роутов** |
| `npm run analyze` (`ANALYZE=true next build`) | `@next/bundle-analyzer`, уже сконфигурирован в `next.config.ts:3-5` | ✅ exit 0, `.next/analyze/{client,nodejs,edge}.html` |
| Разбор `.next/analyze/client.html` (`window.chartData`) | размеры чанков stat/parsed/gzip + модульный состав | 487 клиентских чанков |
| Разбор `.next/server/app/**/page_client-reference-manifest.js` + `.next/build-manifest.json` | per-route клиентские чанки → Route JS / First Load JS | 92 записи |
| `.next/static/media`, `.next/static/css` | шрифты и CSS | 8 woff2 / 184.7 kB; CSS 124.9 + 10.1 + 8.1 kB |

### Что осмотрено

`CLAUDE.md`, `MASTERRYADOM_AI_CONTEXT.md` §11, `docs/QUALITY-GATES.md`, `docs/core-web-vitals-checklist.md`, `next.config.ts`, `src/proxy.ts`, `src/app/layout.tsx`, `prisma/schema/*.prisma` (индексы всех моделей), `src/lib/cache/*`, `src/lib/schedule/{slotsCache,dayPlanCache,engine-context,engine,usecases}.ts`, `src/lib/catalog/catalog.service.ts`, публичные `page.tsx`, `src/app/api/media/route.ts`, `src/lib/ai/client.ts`, `src/components/ui/resilient-image.tsx`, `src/app/globals.css`. Три параллельных под-агента прошли: (а) паттерны запросов Prisma, (б) перепись клиентского бандла, (в) кэш и его инвалидацию — их находки перепроверены точечным чтением файлов (все цитируемые ниже фрагменты прочитаны напрямую).

### Ограничения инструментов — читать до выводов

1. **`next build` в Next.js 16.1.6 больше НЕ печатает колонки размеров.** Вывод содержит только имена роутов и маркер `○`/`ƒ` — ни `Size`, ни `First Load JS`. Проверено: `grep "First Load JS"` по логу сборки — 0 совпадений. Числа в таблице ниже **вычислены мной** из артефактов сборки, а не взяты из вывода Next.
2. **Как именно вычислены.** `First Load JS = Σ(уникальные .js-чанки из clientModules маршрута) + Σ(rootMainFiles)`. Полифилы (110.0 kB) вынесены отдельно — Next их в First Load JS исторически не включает. Байты — **несжатые размеры файлов на диске**, как их печатал Next до 16.x. Колонка gzip для ключевых роутов взята из `gzipSize` анализатора.
3. **Погрешность метода.** Манифест `page_client-reference-manifest.js` перечисляет client-модули поддерева маршрута, включая корневой layout. Наименьший наблюдаемый роут (`/`, `/_not-found`, `/c/[username]`) даёт одинаковые 648.7 kB — это и есть **базовая линия приложения** (общий каркас + `UI_TEXT` + framer + layout). Абсолютные значения могут на несколько процентов расходиться с тем, что напечатал бы Next; **относительные сравнения и состав чанков — точны**, они взяты из анализатора.
4. **Ничего не измерено на живом инстансе.** TTFB, LCP, INP, реальные тайминги SQL, hit-rate Redis — не измерялись. Всё, что этого требует, вынесено в раздел «Гипотезы — не доказано» с планом измерения.
5. **`EXPLAIN ANALYZE` не запускался** — нет прод-объёма данных. По контексту проекта в БД сейчас **44 опубликованных провайдера** (цифра из комментария `src/lib/catalog/catalog.service.ts:255`), поэтому любой сегодняшний замер плана не отражал бы запуск.
6. **Visual search dormant** (`VISUAL_SEARCH_ENABLED=false`, 0 векторов) — pgvector-пути оценены по коду, импакт на запуск считаю нулевым.

---

## Таблица роутов из сборки

**Базовая линия:** shared (`rootMainFiles`, 4 файла) = **485.6 kB** несжатых / **140.5 kB** gzip. Полифилы = **110.0 kB** (грузятся только legacy-браузерам). CSS = **131.9 kB** на любом роуте (один общий `1938df57ce455cbc.css` 124.9 kB + мелочь).

Состав shared:

| Файл | Размер |
|---|---:|
| `static/chunks/855-7b933c5273d38751.js` | 280.3 kB parsed / **75.2 kB gzip** |
| `static/chunks/4bd1b696-e5d7c65570c947b7.js` | 193.8 kB parsed / 60.9 kB gzip |
| `static/chunks/main-app-63b8429a173057fc.js` | 7.9 kB |
| `static/chunks/webpack-033bcf0f9d68fa62.js` | 3.6 kB |

### Режим рендеринга — главный факт таблицы

Точный подсчёт по таблице сборки: **381 запись · 289 из них `/api/**` · 92 страничных · `ƒ (Dynamic)` — 379 · `○ (Static)` — 2.**

Во всей сборке **`○ (Static)` получили ровно два маршрута: `/robots.txt` и `/sitemap.xml`.** Все **90 остальных страничных записей** — `ƒ (Dynamic)`, включая `/`, `/catalog`, `/u/[username]`, `/c/[username]`, `/about`, `/faq`, `/help`, `/terms`, `/privacy`, `/consent`, `/blog`, `/careers`, `/gift-cards`, `/pricing`, `/partners`, `/how-it-works`, `/how-to-book`, `/become-master`, `/403`, `/offline`, `/_not-found`. Причина — одна, в корневом layout (см. **PERF-01**). Все 289 API-роутов тоже `ƒ` — что для них нормально и находкой не является.

### Ключевые публичные роуты (gzip — то, что реально едет по сети)

| Маршрут | Route JS, kB | First Load JS, kB | **First Load gzip, kB** | Режим |
|---|---:|---:|---:|---|
| `/` (лендинг) | 648.7 | 1134.3 | **196.8** | ƒ |
| `/c/[username]` | 648.7 | 1134.3 | **196.8** | ƒ |
| `/terms` (чистый текст!) | 653.4 | 1138.9 | **198.9** | ƒ |
| `/login` | 697.4 | 1183.0 | **213.2** | ƒ |
| `/u/[username]` (профиль мастера/студии) | 786.9 | 1272.5 | **234.5** | ƒ |
| `/u/[username]/booking` | 797.1 | 1282.6 | **238.6** | ƒ |
| `/catalog` | 825.5 | 1311.1 | **248.9** | ƒ |
| `/cabinet/master/schedule/settings` | 888.9 | 1374.5 | **272.0** | ƒ |

### Полная таблица страничных роутов (по убыванию First Load JS)

| Маршрут | Route JS, kB | First Load JS, kB | Режим |
|---|---:|---:|---|
| `/cabinet/studio/settings/public` | 889.2 | 1374.8 | ƒ |
| `/cabinet/master/schedule/settings` | 888.9 | 1374.5 | ƒ |
| `/cabinet/studio/settings/features` | 877.5 | 1363.1 | ƒ |
| `/cabinet/studio/settings` | 853.5 | 1339.1 | ƒ |
| `/cabinet/studio/settings/services` | 853.5 | 1339.1 | ƒ |
| `/catalog` | 825.5 | 1311.1 | ƒ |
| `/cabinet/studio/services/new` | 818.8 | 1304.4 | ƒ |
| `/cabinet/studio/services` | 818.8 | 1304.4 | ƒ |
| `/cabinet/studio/calendar` | 817.4 | 1303.0 | ƒ |
| `/cabinet/studio/bookings` | 806.2 | 1291.8 | ƒ |
| `/cabinet/master/services` | 799.1 | 1284.6 | ƒ |
| `/u/[username]/booking` | 797.1 | 1282.6 | ƒ |
| `/cabinet/studio/schedule-requests` | 789.0 | 1274.5 | ƒ |
| `/providers/[id]` | 786.9 | 1272.5 | ƒ |
| `/u/[username]` | 786.9 | 1272.5 | ƒ |
| `/admin/billing` | 782.8 | 1268.4 | ƒ |
| `/cabinet/studio/notifications` | 779.7 | 1265.2 | ƒ |
| `/cabinet/master/notifications` | 775.2 | 1260.8 | ƒ |
| `/cabinet/master/profile` | 768.8 | 1254.4 | ƒ |
| `/cabinet/master/portfolio` | 760.4 | 1245.9 | ƒ |
| `/admin/users` | 754.4 | 1240.0 | ƒ |
| `/admin/reviews` | 750.0 | 1235.6 | ƒ |
| `/cabinet/master/dashboard` | 744.4 | 1230.0 | ƒ |
| `/cabinet/master/schedule` | 743.4 | 1229.0 | ƒ |
| `/cabinet/master/bookings` | 741.9 | 1227.5 | ƒ |
| `/cabinet/master/messages` | 739.1 | 1224.6 | ƒ |
| `/cabinet/master/settings/public` | 732.7 | 1218.2 | ƒ |
| `/cabinet/profile` | 731.7 | 1217.3 | ƒ |
| `/cabinet/master/clients` | 728.7 | 1214.3 | ƒ |
| `/cabinet/studio/team/add` | 727.2 | 1212.8 | ƒ |
| `/cabinet/studio/team` | 727.0 | 1212.6 | ƒ |
| `/cabinet/master/model-offers` | 726.9 | 1212.5 | ƒ |
| `/cabinet/studio/schedule/settings` | 726.9 | 1212.5 | ƒ |
| `/admin/settings` | 726.8 | 1212.4 | ƒ |
| `/cabinet/studio/billing` | 725.2 | 1210.7 | ƒ |
| `/cabinet/studio/clients` | 724.0 | 1209.5 | ƒ |
| `/cabinet/master/billing` | 722.5 | 1208.1 | ƒ |
| `/cabinet/master/settings/features` | 720.9 | 1206.5 | ƒ |
| `/cabinet/billing` | 720.8 | 1206.4 | ƒ |
| `/cabinet/master/account/security` | 720.1 | 1205.7 | ƒ |
| `/cabinet/studio/reviews` | 719.1 | 1204.7 | ƒ |
| `/cabinet/master/account/notifications` | 715.4 | 1201.0 | ƒ |
| `/cabinet/master/reviews` | 713.2 | 1198.8 | ƒ |
| `/cabinet/master/account/account` | 712.0 | 1197.6 | ƒ |
| `/cabinet/studio/analytics` | 709.6 | 1195.2 | ƒ |
| `/cabinet/master/analytics` | 709.3 | 1194.8 | ƒ |
| `/cabinet/messages` | 703.8 | 1189.3 | ƒ |
| `/cabinet/master/account` | 700.4 | 1186.0 | ƒ |
| `/cabinet/bookings` | 699.9 | 1185.5 | ƒ |
| `/cabinet/studio/finance` | 699.6 | 1185.2 | ƒ |
| `/cabinet/studio` | 699.6 | 1185.2 | ƒ |
| `/admin/cities` | 697.4 | 1183.0 | ƒ |
| `/login` | 697.4 | 1183.0 | ƒ |
| `/cabinet/master` | 697.0 | 1182.5 | ƒ |
| `/admin/catalog` | 684.6 | 1170.2 | ƒ |
| `/cabinet/reviews` | 684.1 | 1169.7 | ƒ |
| `/notifications` | 683.7 | 1169.3 | ƒ |
| `/cabinet/settings` | 683.1 | 1168.7 | ƒ |
| `/cabinet/roles` | 680.7 | 1166.3 | ƒ |
| `/cabinet/favorites` | 680.1 | 1165.7 | ƒ |
| `/cabinet/notifications` | 678.3 | 1163.9 | ƒ |
| `/cabinet/faq` | 677.4 | 1163.0 | ƒ |
| `/cabinet/model-applications` | 676.8 | 1162.4 | ƒ |
| `/models` | 675.8 | 1161.4 | ƒ |
| `/models/[code]` | 675.8 | 1161.4 | ƒ |
| `/partners` | 672.7 | 1158.3 | ƒ |
| `/become-master` | 671.3 | 1156.9 | ƒ |
| `/about` | 668.8 | 1154.4 | ƒ |
| `/how-it-works` | 667.7 | 1153.3 | ƒ |
| `/support` | 662.9 | 1148.5 | ƒ |
| `/cabinet` (user) | 661.7 | 1147.3 | ƒ |
| `/admin` | 661.6 | 1147.1 | ƒ |
| `/how-to-book` | 659.0 | 1144.6 | ƒ |
| `/book` | 658.8 | 1144.4 | ƒ |
| `/pricing` | 657.2 | 1142.7 | ƒ |
| `/help` | 657.2 | 1142.7 | ƒ |
| `/faq` | 655.4 | 1141.0 | ƒ |
| `/offline` | 655.3 | 1140.9 | ƒ |
| `/consent` | 653.4 | 1138.9 | ƒ |
| `/privacy` | 653.4 | 1138.9 | ƒ |
| `/terms` | 653.4 | 1138.9 | ƒ |
| `/403` | 649.2 | 1134.8 | ƒ |
| `/blog` | 648.9 | 1134.5 | ƒ |
| `/careers` | 648.9 | 1134.5 | ƒ |
| `/gift-cards` | 648.9 | 1134.5 | ƒ |
| `/c/[username]` | 648.7 | 1134.3 | ƒ |
| `/clients/[id]` | 648.7 | 1134.3 | ƒ |
| `/` | 648.7 | 1134.3 | ƒ |
| `/_global-error` | 648.7 | 1134.3 | ƒ |
| `/_not-found` | 648.7 | 1134.3 | ƒ |
| `/robots.txt` | — | — | **○** |
| `/sitemap.xml` | — | — | **○** |

Все 289 `/api/**` — `ƒ`, клиентского JS не несут (в таблицу не включены).

---

## Топ-нарушители бандла и их причины

Из `.next/analyze/client.html` (`statSize` — исходные байты модуля, `parsed` — после минификации, `gzip` — по сети).

| Чанк | parsed / gzip | Что внутри (точные модули) | Где грузится |
|---|---:|---|---|
| `9121-2b37952fba86cf7b.js` | **314.7 / 81.0 kB** | `src/lib/ui/text.ts` — **454.7 kB** (99.95 % чанка). Второй модуль — `src/lib/utils/pluralize.ts`, 0.2 kB | **Все** проверенные роуты: `/`, `/catalog`, `/u/[username]` |
| `855-7b933c5273d38751.js` | **280.3 / 75.2 kB** | `node_modules/next` 691.2 kB + **`node_modules/zod` 523.9 kB** | В `rootMainFiles` → **каждая страница** |
| `4bd1b696-…js` | 193.8 / 60.9 kB | `node_modules/next` 594.0 kB (рантайм роутера) | `rootMainFiles` |
| `3204-6eb6af84e9a2c7c3.js` | **123.6 / 40.6 kB** | `framer-motion` 302.2 + `motion-dom` 141.4 + `motion-utils` 5.9 kB | `/`, `/catalog`, `/u/[username]`, кабинеты |
| `1705-881264cd24fe26c4.js` | 113.2 / 28.2 kB | `src/features/public-profile` 199.9 + `public-studio` 67.6 + `booking` 17.3 + `reviews` 15.7 kB | публичные профили |
| `210-1e334d318033de4b.js` | **80.7 / 23.5 kB** | `react-day-picker` 212.0 + `date-fns` 104.8 + `@date-fns/tz` 16.9 kB | **`/catalog`** и `/cabinet/master/schedule/settings` |
| `app/catalog/page-…js` | 80.2 / 22.3 kB | `catalog-page-client` 41.8 + `visual-search-modal` 24.2 + `catalog-map` 24.0 kB | `/catalog` |
| `3069-2f76eb7616b9daef.js` | **66.0 / 21.0 kB** | `.prisma/client/index-browser.js` 38.3 + `@prisma/client/runtime/index-browser.js` 34.5 kB | 20 client-компонентов (кабинеты/админка) |
| `app/layout-…js` | 48.6 / 13.4 kB | `bottom-nav` 21.4 + `auth-mobile-menu` 13.4 + `auth-user-menu` 10.9 + `notifications-bell` 10.6 kB | каждая страница |

### Агрегат `node_modules` по всем клиентским чанкам (statSize)

```
 4805.8 kB  (код приложения)
 1774.8 kB  next
 1047.7 kB  zod                    ← 523.9 kB из них в rootMainFiles
  793.5 kB  @sentry/conventions    ← только в async-чанках, см. ниже
  532.6 kB  react-dom
  529.0 kB  lucide-react           ← размазан по route-чанкам, tree-shaking работает
  483.1 kB  framer-motion
  308.2 kB  @sentry/browser
  283.1 kB  @sentry/core
  212.0 kB  react-day-picker
  162.0 kB  @radix-ui/react-slot
  141.4 kB  motion-dom
  104.8 kB  date-fns               ← транзитивно из react-day-picker
   72.9 kB  swr
   56.2 kB  react-easy-crop
   43.8 kB  qrcode.react
   38.3 kB  .prisma
   34.6 kB  @prisma/client
   32.7 kB  @tanstack/react-virtual
```

**Две хорошие новости, которые важно зафиксировать, чтобы их случайно не «починили»:**

- **Sentry (GlitchTip) изолирован корректно.** ~1.38 МБ `@sentry/*` лежат в чанках `6759.5dfcdda2b9a9092b.js`, `4853.279172932f93b004.js`, `5d015edf…`, `dc9729d2…` — ни одного из них нет в `rootMainFiles` и ни один не попал в манифесты `/`, `/catalog`, `/u/[username]`. Загрузка через `void import("@/lib/observability/browser")` в `src/instrumentation-client.ts:27` за build-time-флагом работает как задумано.
- **`lucide-react` не даёт barrel-эффекта.** Все 356 импортов — именованные из бочки (`import { X } from "lucide-react"`), deep-path импортов 0, `optimizePackageImports` в конфиге нет — и всё равно 529 kB размазаны по route-чанкам порциями 15–25 kB. Webpack справляется сам. **Добавлять `modularizeImports` для lucide не нужно.**

---

## Недостающие индексы (с точными формами запросов)

Ниже — только те формы, которые я вычитал из кода (не догадки), и только там, где существующего индекса нет. Список индексов взят из `prisma/schema/*.prisma` (`@@index`).

| # | Форма запроса (файл:строка) | Существующие индексы | Чего не хватает |
|---|---|---|---|
| I-1 | `booking.findMany` `where { masterProviderId, status notIn […], startAtUtc { gte, lt } }` `orderBy startAtUtc asc` — `src/lib/master/bookings.service.ts:175-210` (канбан мастера, обе ветки) | `Booking @@index([masterProviderId])` (`booking.prisma:127`), `@@index([status, startAtUtc])` (`:133`) | **`@@index([masterProviderId, startAtUtc])`**. Сейчас Postgres берёт `masterProviderId`, тянет всю историю мастера и сортирует. Пара `providerId` покрыта индексом `([providerId, startAtUtc, endAtUtc])` (`:125`), а её зеркало для `masterProviderId` отсутствует — при том, что `masterPerformedBookingWhere` (`src/lib/bookings/master-booking-scope.ts`) даёт **OR по обоим** |
| I-2 | `booking.findMany` `where { clientUserId }` `orderBy startAtUtc desc` `take 300` — `src/lib/client-cabinet/bookings.service.ts:78-81` («Мои записи» клиента) | `@@index([clientUserId])` (`:130`) | **`@@index([clientUserId, startAtUtc(sort: Desc)])`**. Без него `take: 300` не спасает: сортировка идёт по всему набору клиента |
| I-3 | `booking.findMany` `where { OR: [{studioId}, {providerId}], status notIn […] }` `orderBy [startAtUtc desc, createdAt desc]` — `src/lib/studio/clients.service.ts:102-129` | `@@index([studioId])` (`:131`), `@@index([providerId])` (`:126`) | **`@@index([studioId, startAtUtc(sort: Desc)])`**. Тот же разрыв, что I-1, для арендатора-студии |
| I-4 | `booking.findMany` `where { OR: [{providerId}, {masterProviderId}], status notIn […] }` `orderBy [startAtUtc asc, createdAt asc]` — `src/lib/master/clients-view.service.ts:263-285` | те же | покрывается I-1 + существующим `([providerId, startAtUtc, endAtUtc])` |
| I-5 | `booking.findMany` `where { OR:[{masterProviderId}, {masterProviderId:null, providerId}], status notIn […], overlap(startAtUtc,endAtUtc) }` — `src/lib/schedule/usecases.ts:311-322` (**на каждый публичный запрос слотов**) | `([providerId, startAtUtc, endAtUtc])` покрывает вторую ветвь OR | покрывается I-1 (первая ветвь OR) |
| I-6 | `provider.findMany` `where { isPublished, cityId, availableToday?, type?, ratingAvg gte?, priceFrom range? }` `orderBy [ratingAvg desc, reviews desc, createdAt desc, id asc]` — `src/lib/catalog/catalog.service.ts:262-268`, `:301-312`, `:882-…` | `@@index([isPublished, ratingAvg desc, reviews desc, createdAt desc])` (`provider.prisma:159`), `@@index([cityId, isPublished])` (`:163`) | **`@@index([cityId, isPublished, ratingAvg(sort: Desc), reviews(sort: Desc), createdAt(sort: Desc)])`**. С выбранным городом (дефолт UI) существующий сорт-индекс перестаёт покрывать `orderBy` — остаётся `(cityId,isPublished)` + внешняя сортировка |
| I-7 | `review.findMany` активных отзывов провайдера: `where { targetType, targetId, deletedAt: null }` `orderBy createdAt desc` — фильтр `ACTIVE_REVIEW_FILTER` (`src/lib/reviews/soft-delete.ts`), потребители `src/lib/reviews/service.ts:513`, `src/lib/reviews/unanswered-list.ts:21` | `@@index([targetType, targetId])` (`review.prisma:58`), `@@index([deletedAt])` (`:61`) | **`@@index([targetType, targetId, deletedAt, createdAt(sort: Desc)])`**. Сейчас: индексный доступ по (type,target) → фильтр `deletedAt` → сортировка. На «звёздном» мастере с тысячами отзывов сортировка станет заметной |
| I-8 | `portfolioItem.findMany` `where { masterId in […], inSearch, isPublic }` — `src/lib/client-cabinet/favorites.service.ts:62`; и `where { isPublic, createdAt gte, master:{…} }` — `src/lib/feed/stories.service.ts:67` (лента на главной) | `@@index([isPublic, createdAt desc, id desc])` (`media.prisma:129`), `@@index([masterId, createdAt])` (`:125`) | покрыто; **индекс не нужен** — проблема этих мест в отсутствии `take`, а не в индексе (см. PERF-06/PERF-22) |
| I-9 | `service.findMany` поиск: `name/title contains … mode: insensitive` — `src/lib/catalog/catalog.service.ts:671-673`, `:1190-1204` | `@@index([providerId, isEnabled, isActive])` (`service.prisma:67`) | **GIN + `pg_trgm`** на `Service.name` и `Service.title`. `contains` + `insensitive` компилируется в `ILIKE '%q%'` — ведущий wildcard, btree бесполезен, план = seq scan по `Service`. Триграммных индексов в проекте нет: `grep pg_trgm\|USING gin prisma/schema/migrations/` — 0 совпадений. Объект пришлось бы завести сырым SQL и внести в `scripts/raw-sql-objects.mjs` |

**Индекс, который трогать НЕ надо:** `media_asset_embeddings_embedding_hnsw_idx` (`prisma/schema/migrations/20260713120000_…/migration.sql:22-24`, `hnsw (embedding vector_cosine_ops)`). Размерность `vector(256)` подтверждена и в миграции, и в `src/lib/visual-search/searcher.ts` (`VECTOR_LIMIT = 50`, `FILTER_LIMIT = 5000`). Гейты `check:schema-drift` / `check:migration-drops` его уже стерегут.

---

## Гэпы инвалидации кэша

**Главный вывод: гэпов, приводящих к выдаче протухших слотов, НЕ найдено.** Это надо сказать прямо, потому что в задании это помечено как потенциальный P1-класс. Пройдены все пути записи (полный перебор `prisma.booking.(create|update|updateMany|delete)`, `scheduleTemplate.*`, `scheduleOverride.*`, `scheduleBreak.*`, `weeklyScheduleConfig.*`, `timeBlock.*`, `provider.update` со slot-полями):

| Класс мутации | Инвалидация |
|---|---|
| Все 8 путей создания брони (`createBooking`, `createClientBooking`, `createStudioBooking`, `createSoloMasterBooking`, solo/studio package, model-application confirm) | ✅ `invalidateSlotsForBookingRange` |
| `confirmBooking` / `rescheduleBooking` / `moveStudioBooking` / `updateMasterBookingStatus` | ✅ `invalidateSlotsForBookingMove` / `…ForBookingRange` |
| `cancelBooking` | ✅ условно — ветка `declinesMasterChange` (`src/lib/bookings/cancelBooking.ts:96-103`) возвращает бронь в `CONFIRMED` на **исходное** время, слоты не меняются. Корректно |
| `declineClientRescheduleRequest` (`src/lib/bookings/decline-reschedule.ts:49-58`) | ✅ не нужна — пишутся только `proposedStartAt/EndAt` → null и статус; `startAtUtc/endAtUtc` не трогаются |
| Все редакторы расписания (`editor.ts:568`, `unified.ts:273/321/328/384/510/519/795`, `usecases.ts:206/230`, `provider/schedule/status/route.ts:138`) | ✅ |
| TimeBlock CRUD (`src/lib/studio/calendar.service.ts:201/248/275`) — все три записи в репозитории | ✅ |
| `setProviderBuffer` (`src/lib/schedule/usecases.ts:572-589`), смена tz мастера (`src/lib/master/profile.service.ts:463`), смена tz студии (`src/lib/studios/studio.ts:195`) | ⚠️ инвалидатор не вызывается, но **значение входит в ключ** (`bufferMin`, `timeZone` — `slotsCache.ts:21`) **и** `provider.updatedAt` двигает `scheduleVersion` → старые записи осиротевают, а не отдаются. Корректно, но платим churn'ом (PERF-18) |

### Что всё же стоит записать

- **`dayPlan:*` и `bookingDays:*` не удаляет ни один путь.** `invalidateSlotsForMaster` (`src/lib/schedule/slotsCache.ts:59`) чистит только `slots:${masterId}:*`. Функции инвалидации `dayPlan` в репозитории нет вовсе. Защита — только `scheduleVersion` в ключе + TTL 120 с. Сегодня это не баг: `DayPlan` содержит рабочие интервалы и перерывы, но **не** брони и не блоки (`src/lib/schedule/engine.ts:39-53`), а `bookingDays` — только рабочие дни. **Но инвариант хрупкий:** первый же день, когда в `DayPlan` положат что-то зависящее от броней или `TimeBlock`, он молча начнёт отдавать протухшее. → **PERF-19**.
- **`TimeBlock.updatedAt` не входит в `scheduleVersion`** (`src/lib/schedule/engine-context.ts:124-146` — там `Provider`, `ScheduleOverride`, `ScheduleBreak(OVERRIDE)`, `ScheduleTemplate`, `WeeklyScheduleConfig`, и всё). Значит блоки защищены **исключительно** тремя явными вызовами `invalidateSlotsForMaster` — а `delByPattern` глотает любую ошибку Redis (`src/lib/cache/redisClient.ts:62-67`) и возвращает `void`. Один упавший SCAN = до 120 с бронируемых слотов поверх блока. → **PERF-19**.
- **Пути удаления не инвалидируют:** `src/lib/deletion/delete-master.ts:69-72` (сносит `scheduleTemplate`/`Override`/`Break`/`WeeklyConfig`) и `src/lib/deletion/delete-studio.ts:143,149`. У `delete-master` есть `provider.update` на `:89`, который двигает `updatedAt` → версия уходит вперёд; у `delete-studio` такой страховки в явном виде я не увидел. Риск низкий (кабинет удалён — его слоты никто не запросит), но записываю честно.

---

## Находки

Итог: **P0 — 0 · P1 — 9 · P2 — 13 · P3 — 8** (всего 30: PERF-01…PERF-30).

Про отсутствие P0 — отдельно и честно: ни одна найденная проблема не делает продукт неработоспособным на текущем объёме (44 провайдера, 56 демо-броней). Всё, что ниже, — это либо перф ключевых страниц сегодня, либо гарантированная деградация при росте. Выдавать что-то из этого за «блокер запуска» значило бы завышать.

---

### P1 🟠

#### PERF-01 — Ни одна страница не может быть отрендерена статически: `cookies()` + `headers()` в корневом layout

**Файлы:** `src/app/layout.tsx:180`, `src/app/layout.tsx:189`; `src/lib/csp/nonce.ts:3-5`

```ts
// src/app/layout.tsx:179-190
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = await getNonce();                       // → headers()
  const { any: authEnabled } = await resolveAuthMethods();
  const cookieNoticeAcknowledged = hasAcknowledgedCookieNotice(
    (await cookies()).get(COOKIE_NOTICE_COOKIE)?.value, // → cookies()
  );
```

```ts
// src/lib/csp/nonce.ts
import { headers } from "next/headers";
export async function getNonce(): Promise<string> {
  const h = await headers();
  return h.get("x-nonce") ?? "";
}
```

**Доказательство:** таблица роутов `next build` — `○ (Static)` получили **ровно 2 из 92** страничных записей (`/robots.txt`, `/sitemap.xml`). Плюс подтверждающий перебор по всему `src/app/**`: `export const revalidate` — **0 вхождений**, `unstable_cache` — **0**, `revalidatePath` — **0**, `revalidateTag` — **0**, `force-static` — **0**, `next: { revalidate }` в `fetch()` — **0**. Комментарий в самом файле (`:186-187`) фиксирует, что автор об этом знал: «this layout is already dynamic (`getNonce()` reads headers)».

**Импакт.** Три отдельных следствия:
1. `/terms`, `/privacy`, `/consent`, `/about`, `/faq`, `/help`, `/blog`, `/careers`, `/gift-cards`, `/how-it-works`, `/how-to-book`, `/partners`, `/become-master`, `/403`, `/offline` — статический текст — рендерятся RSC-деревом на **каждый** запрос. Юрдокументы обязаны быть мгновенными: на них смотрит РКН и на них ведут ссылки из футера.
2. `/`, `/catalog`, `/u/[username]`, `/c/[username]` не могут получить ISR **в принципе** — даже добавив `revalidate` в сам сегмент, корневой layout всё равно уронит маршрут в dynamic. То есть каждый визит анонима на профиль мастера = полный набор запросов к Postgres (см. PERF-04).
3. Нет пути к CDN-кэшированию HTML — а это самый дешёвый рычаг для маркетплейса, где основной трафик анонимный и одинаковый.

**Направление фикса.** Nonce и cookie-баннер не обязаны жить в корневом layout. Варианты, по возрастанию инвазивности: (а) перенести `CookieNotice` в клиентский компонент, читающий cookie на клиенте (SSR-подавление — оптимизация, а не требование), а nonce получать через отдельный маленький серверный компонент внутри `<head>`, вынесенный за границу статичности; (б) заменить nonce-based CSP на hash-based для статичных страниц; (в) минимально — сгруппировать чисто статичные маршруты в отдельную route-группу со своим layout без `cookies()`/`headers()`. Вариант (в) даёт быстрый выигрыш на юрдокументах и маркетинге без риска для CSP на динамике.

**Трудоёмкость:** M (вариант «в» — S).

---

#### PERF-02 — `src/lib/ui/text.ts` (454.7 kB, 81 kB gzip) целиком едет в браузер на каждом роуте

**Файл:** `src/lib/ui/text.ts` — 413 362 байта исходника.

**Доказательство** (`.next/analyze/client.html`):
```
### static/chunks/9121-2b37952fba86cf7b.js  stat=455.0 parsed=314.7 gzip=81.0
       454.7 kB  .../src/lib/ui/text.ts
         0.2 kB  .../src/lib/utils/pluralize.ts
```
Присутствие чанка в манифестах: `/` → есть, `/catalog` → есть, `/u/[username]` → есть (проверено перебором `clientModules[*].chunks` в `page_client-reference-manifest.js`). Это **крупнейший чанк кода приложения в проекте** и один-единственный модуль в нём.

**Импакт.** 81 kB gzip — это ~41 % всего first-load-JS лендинга (196.8 kB gzip). Анонимный посетитель `/c/[username]` скачивает словарь текстов админки, биллинга, студийного кабинета и модерации отзывов. На 3G это заметные сотни миллисекунд до интерактивности; это самый крупный единичный выигрыш, доступный в бандле.

**Важно:** это **не предложение нарушить инвариант #13** (`UI_TEXT` — единственный источник). Речь о физической раскладке одного объекта по модулям, а не о разрешении хардкода.

**Направление фикса.** Разрезать `text.ts` на доменные модули (`text/public.ts`, `text/cabinet.ts`, `text/admin.ts`, `text/legal.ts`, …) с ре-экспортом `UI_TEXT` для серверного кода, чтобы webpack мог tree-shake'ать по маршрутам. Гейт `check:ui-text` при этом продолжает работать — он проверяет отсутствие хардкода, а не расположение файла. Промежуточный дешёвый шаг: убедиться, что клиентские компоненты берут `UI_TEXT.<section>` деструктуризацией на уровне модуля, а не тянут корневой объект.

**Трудоёмкость:** L (много точек импорта), но окупается больше всех.

---

#### PERF-03 — `zod` (523.9 kB) лежит в `rootMainFiles` и грузится на каждой странице

**Доказательство** (`.next/analyze/client.html` + `.next/build-manifest.json`):
```
### static/chunks/855-7b933c5273d38751.js  stat=1216.5 parsed=280.3 gzip=75.2
       691.2 kB  node_modules/next
       523.9 kB  node_modules/zod
```
```js
// .next/build-manifest.json → rootMainFiles
["static/chunks/webpack-…js", "static/chunks/4bd1b696-…js",
 "static/chunks/855-7b933c5273d38751.js", "static/chunks/main-app-…js"]
```
Топ-модули zod внутри чанка: `zod/v4/core/schemas.js` 75.2 kB, `zod/v4/classic/schemas.js` 44.5 kB, `zod/v4/core/api.js` 27.2 kB, **`zod/v4/classic/from-json-schema.js` 22.6 kB** (JSON-Schema-конвертер — на клиенте не нужен никогда).

**Импакт.** Валидатор, чья основная работа — серверный `parseBody`, попал в чанк, который Next загружает первым на **любом** маршруте, включая `/terms`. Точный «сколько именно из 75.2 kB gzip приходится на zod» из данных анализатора не выводится (чанк смешанный) — но 523.9 из 1216.5 kB stat это 43 % чанка.

**Направление фикса.** Найти клиентские модули, тянущие zod-схемы (типично: общий `schemas.ts`, импортируемый и роутом, и формой). Для клиента — оставить только `z.infer` типы через `import type` (стираются) и, где нужна клиентская валидация, вынести узкую схему в отдельный `*-shared.ts`. Это ровно тот же приём, что уже применён для `schedule/editor.ts` ↔ `editor-shared.ts` (CLAUDE.md rule 13) — здесь он нужен по весу, а не по server-only-импортам.

**Трудоёмкость:** M.

---

#### PERF-04 — Кэш слотов не экономит обращения к БД: 13 запросов на каждый публичный `/slots` до чтения кэша

**Файлы:** `src/lib/schedule/usecases.ts:291`, `:301`, `:311`, `:358`, `:380`; `src/lib/schedule/engine-context.ts:125-142`, `:179`, `:197`, `:203`, `:250`, `:264`

Порядок в `listAvailabilitySlotsPaginated` — **безусловно, до любого `getCachedSlots`**:

```ts
// src/lib/schedule/usecases.ts:291
const provider = await prisma.provider.findUnique({ where: { id: providerId }, select: {…} }); // 1
// :301
const ctx = await createScheduleContext({ providerId, timezoneHint: timezone, range: {…} });   // 2..11
// :311
const bookings = await prisma.booking.findMany({ where: { OR: […], status: { notIn: […] },
  ...buildBookingOverlapWhere(rangeFromUtc, rangeToExclusiveUtc) }, … });                       // 12
// :358
const blockRanges = await loadTimeBlockRanges(providerId, rangeFromUtc, rangeToExclusiveUtc);   // 13
// :380 — и только теперь, в цикле по дням:
const cached = await getCachedSlots(cacheKey);
```

`createScheduleContext` — это 10 round-trip'ов: `provider.findUnique` (`engine-context.ts:179`) + **пятиоператорная `$transaction` только ради вычисления `scheduleVersion`** (`:125-142`: `provider.findUnique` + 4 × `aggregate _max updatedAt` по `ScheduleOverride`, `ScheduleBreak`, `ScheduleTemplate`, `WeeklyScheduleConfig`) + `weeklyScheduleConfig.findUnique` (`:197`) + `scheduleTemplate.findMany` (`:203`) + `scheduleOverride.findMany` (`:250`) + `scheduleBreak.findMany` (`:264`).

**Импакт.** Кэш слотов (TTL 120 с) экономит только CPU на `buildSlotsForDay` и вывод `DayPlan`. **Все 13 запросов выполняются одинаково и при попадании, и при промахе.** Это самый горячий публичный эндпоинт продукта — виджет бронирования дёргает его при каждом выборе даты/услуги, а виджет студии умножает это на число мастеров (см. PERF-08). Ирония в том, что пять из тринадцати запросов существуют исключительно чтобы **вычислить ключ кэша**.

**Направление фикса.** По шагам, от дешёвого к дорогому:
1. Обернуть `createScheduleContext` в React `cache()` — снимет повторные вызовы внутри одного запроса (сейчас в слот-пути `cache()` нет ни на одной функции, проверено).
2. Кэшировать сам `scheduleVersion` в Redis по `provider:{id}:schedVer` с инвалидацией из уже существующих вызовов `invalidateSlotsForMaster` — 5 запросов → 1 GET.
3. Кэшировать `bookings`+`blocks` для диапазона под тем же `scheduleVersion` + датным ключом, или перенести проверку кэша **выше** загрузки броней: если все дни диапазона в кэше — запросы 12–13 не нужны вовсе.

**Трудоёмкость:** M.

---

#### PERF-05 — Каталог ранжирует весь отфильтрованный набор в Node: `findMany` без `take` на каждый показ каталога

**Файлы:** `src/lib/catalog/catalog.service.ts:262-268` (rating), `:301-312` (**relevance — дефолтная сортировка**), `:366-381` (price)

```ts
// :301-312 — relevance, дефолт каталога И источник домашнего рейла «Топ-мастера»
const [rows, prior] = await Promise.all([
  prisma.provider.findMany({
    where: args.where,
    orderBy: BASE_ORDER,
    select: { id: true, ratingAvg: true, reviews: true, createdAt: true,
              ownerUserId: true, type: true },
  }),
  loadGlobalMeanRating(),
]);
```

Ценовая сортировка — тяжелее всех: тянет **все услуги всех подходящих провайдеров**:
```ts
// :366-381
const rows = await prisma.provider.findMany({
  where: args.where, orderBy: BASE_ORDER,
  select: { id: true, priceFrom: true,
    services: { where: { isEnabled: true, isActive: true }, select: { price: true } },
    masterServices: { where: {…}, select: { service: { select: { price: true } } } },
  },
});
```

Плюс сам показ страницы (`:882-…`) на каждую из ≤40 карточек тянет **`services` и `masterServices` без `take`** и `masters` без `take`.

**Доказательство осознанности:** комментарий в файле, `:253-256` — «Cost: one extra query of a few small columns per row matching the filter (44 published providers today — negligible). It is a filtered scan, so it does not scale indefinitely; the scale answer is a precomputed score column, i.e. a schema change, deliberately out of scope.»

**Импакт.** Ровно тот сценарий, который задан в миссии («100× текущего объёма»). При 4 400 провайдерах каждый показ каталога — материализация 4 400 строк в Node + сортировка в JS; при ценовой сортировке ещё и все их услуги (у студии их бывают сотни). Страница, которая решает конверсию, деградирует линейно по числу провайдеров, а не по размеру страницы.

**Направление фикса.** Автор фикса уже назвал верный: **денормализованная колонка `Provider.rankScore`** (Bayesian base), пересчитываемая тем же воркером, который уже считает `availableToday` — тогда relevance/rating становятся обычным `ORDER BY` с индексом и настоящей пагинацией. Для price — `Provider.priceFromEffective` (min по включённым услугам), обновляемая при записи услуги. До этого — как минимум ограничить `services`/`masterServices` в карточном `select` через `take: 8` (карточке больше не нужно).

**Трудоёмкость:** L (нужна миграция + пересчёт), но `take` на карточных relations — S и даёт немедленный выигрыш.

---

#### PERF-06 — CRM-страницы грузят всю пожизненную историю броней арендатора без `take`

**Файлы:** `src/lib/studio/clients.service.ts:102-129`, `src/lib/master/clients-view.service.ts:263-285` (и `:439`)

```ts
// src/lib/studio/clients.service.ts:102
const bookings = await prisma.booking.findMany({
  where: {
    OR: [{ studioId: studio.id }, { providerId: studio.providerId }],
    status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
  },
  select: { …, serviceItems: { select: { titleSnapshot: true, priceSnapshot: true },
                               orderBy: { createdAt: "asc" } } },
  orderBy: [{ startAtUtc: "desc" }, { createdAt: "desc" }],
});
```

Ни `take`, ни `cursor`, ни временного окна. Вложенный `serviceItems` — тоже без `take`, то есть на каждую бронь ещё N строк.

**Импакт.** `/cabinet/studio/clients` у студии с 5 000 броней = 5 000 строк + все их `serviceItems` за один SSR-рендер, с группировкой в JS. Это ровно тот случай, который задание называет прямо («студия с 5k броней не должна грузить их все»). Память Node растёт линейно, и при нескольких одновременных студиях это самый вероятный OOM-кандидат приложения.

**Направление фикса.** Агрегаты (число визитов, сумма, дата последнего визита на клиента) считать в БД через `groupBy` по `clientUserId`/`clientPhone`, а не в JS; список клиентов пагинировать курсором; полную историю грузить только в детальной панели клиента, тоже с `take`.

**Трудоёмкость:** M.

---

#### PERF-07 — Медиа не ресайзится при загрузке: оригиналы до 10 МБ, вложения чата отдаются в браузер в исходном разрешении

**Файлы:** `src/app/api/media/route.ts:93-102`; `src/lib/media/types.ts:9`; `src/features/chat/chat-window/message-bubble.tsx:54-71`; `src/app/api/chat/attachment/[token]/route.ts:75-84`

```ts
// src/app/api/media/route.ts:93-102 — единственная обработка изображения на аплоаде
if (detected.mime === "image/png") {
  outputMime = "image/webp";
  outputBuffer = await sharp(rawBuffer).webp({ quality: 95 }).toBuffer();
} else if (detected.mime === "image/jpeg") {
  outputMime = "image/jpeg";
  outputBuffer = await sharp(rawBuffer).jpeg({ quality: 95 }).toBuffer();
} else {
  outputMime = "image/webp";
  outputBuffer = await sharp(rawBuffer).webp({ quality: 95 }).toBuffer();
}
```
Перекодирование есть — **`.resize()` нет**. Проверено по всему дереву: единственный `.resize(` в `src/` — `src/lib/visual-search/provider.ts:151` (in-memory, для эмбеддингов). Вариантов (thumb/medium/full) не генерируется. Предел — `MEDIA_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024` (`src/lib/media/types.ts:9`). Те же три ветки без ресайза — в `src/app/api/chat/upload-attachment/route.ts:90-96` и `src/app/api/bookings/upload-reference/route.ts:79-85`.

**Два разных следствия, и их надо различать:**

1. **Портфолио / аватары — браузер защищён, сервер нет.** Они рендерятся через `ResilientImage` → `next/image`, поэтому пользователь получает ресайз. Но оптимизатор Next при каждом промахе своего кэша **скачивает 10-мегабайтный оригинал из S3 и жмёт его на CPU app-сервера** — по одному разу на каждую комбинацию (ширина × качество × формат). При 100× портфолио это и трафик к S3, и CPU, и раздутый кэш оптимизатора.
2. **Вложения чата — оригинал едет прямо в браузер.** Здесь `next/image` не применяется осознанно:
```tsx
// src/features/chat/chat-window/message-bubble.tsx:56-61
{/* Plain <img> intentional — the chat-attachment delivery route
    streams bytes via cookie-auth + token. next/image would
    rewrite the URL through the optimisation pipeline and lose our token. */}
<img src={url} alt="" loading="lazy" … />
```
Контейнер — `aspect-[4/3] min-h-[200px]` (`:55`). То есть в бокс высотой 200 px грузится файл до 10 МБ, отдаваемый роутом `src/app/api/chat/attachment/[token]/route.ts:75-84` как есть.

**Направление фикса.** Добавить в аплоад-пайплайн `sharp(...).rotate().resize({ width: MAX_W, withoutEnlargement: true })` — один вызов в трёх роутах, `MAX_W` порядка 2000 для портфолио и 1600 для чата. Это ограничивает и хранилище, и вход оптимизатора, и вложения чата разом. Генерация нескольких вариантов — отдельная, более крупная задача; ограничение верхней грани решает 90 % проблемы за S.

**Трудоёмкость:** S (ресайз на аплоаде) / L (полноценные варианты).

---

#### PERF-08 — N+1 в публичном виджете бронирования студии и в поиске по времени

**Файлы:** `src/lib/schedule/studio-slot-aggregation.ts:101-110`; `src/lib/search-by-time/service.ts:297-303`; `src/lib/bookings/recent-masters.ts:129`

```ts
// src/lib/schedule/studio-slot-aggregation.ts:101-110 — публичный виджет студии
const perMaster = await Promise.all(
  masterIds.map(async (masterId) => {
    const duration = await resolveServiceDuration(masterId, input.serviceId);   // 2 запроса
    …
    const result = await listAvailabilitySlotsPaginated(masterId, input.serviceId,
      duration.data, { fromKey, toKeyExclusive, limit: 14 });                    // ← 13 запросов (PERF-04)
```

`resolveServiceDuration` сам по себе — 2 независимых запроса, выполняемых **последовательно** (`src/lib/schedule/resolveDuration.ts:9` и `:17`; третий на `:39` действительно зависит от обоих).

**Импакт.** Стоимость одного открытия виджета студии = `M × (2 + 13)` запросов, где `M` — число подходящих мастеров. Vision Beauty Studio из сида — 7 ACTIVE мастеров → **≈105 запросов на один клик по дате**, при том что все они параллельны и бьют в один пул соединений Prisma. Это страница конверсии.

Тот же паттерн: `src/lib/search-by-time/service.ts:297` (публичный поиск по времени, `Promise.all` по кандидатам, каждый — полный расчёт слотов) и `src/lib/bookings/recent-masters.ts:129` (рейл на главной; в теле `buildRecentMasterItem` — `service.findUnique` `:154` + `findNextSlot` `:192`).

**Направление фикса.** Свести к пакетным запросам: длительности всех мастеров за один `masterService.findMany({ where: { masterProviderId: { in: masterIds }, serviceId } })`; расписания — один `createScheduleContext` на все `masterIds` (запросы к `ScheduleTemplate`/`Override`/`Break` уже фильтруются по `providerId`, `in` тривиально); брони — один `booking.findMany` с `masterProviderId: { in: … }`. Это же автоматически чинит и PERF-04 для студийной ветки.

**Трудоёмкость:** L.

---

#### PERF-09 — Отсутствуют композитные индексы под реальные формы списков броней и каталога

См. раздел «Недостающие индексы» — позиции **I-1, I-2, I-3, I-6, I-7** (плюс I-9 как отдельная задача под триграммы).

**Импакт.** Все пять обслуживают экраны, которые пользователь открывает первым делом в своей роли: канбан мастера, «Мои записи» клиента, клиенты студии, каталог с выбранным городом, отзывы на публичном профиле. Сегодня на демо-данных разницы нет; при росте каждая из них превращается в «взять всё по одному столбцу и отсортировать».

**Направление фикса.** Одна миграция `npx prisma migrate dev --name add_perf_composite_indexes` с пятью `@@index`. Строго через `migrate dev` (CLAUDE.md rule 16), и после генерации проверить, что Prisma не дописала `DROP INDEX "media_asset_embeddings_embedding_hnsw_idx"` — она это делает в **каждую** новую миграцию (`scripts/raw-sql-objects.mjs`, гейт `check:migration-drops`).

**Трудоёмкость:** S.

---

### P2 🟡

#### PERF-10 — Нет single-flight: промах по горячему ключу пересчитывают все параллельные запросы

**Файлы:** `src/lib/schedule/usecases.ts:380-405` и `:520-543`; `src/lib/schedule/engine.ts:22-53`; `src/app/api/public/providers/[providerId]/booking-days/route.ts:49-67`; `src/lib/advisor/cache.ts:18-27`

Все четыре — один и тот же шаблон `get → (miss) → compute → set`, без лока. `setNx` (`src/lib/cache/cache.ts:46`) в проекте есть, но используется только для идемпотентности и дедупа джоб (`src/lib/idempotency/idempotency.ts:13,26`; `src/lib/master/weekly-stats-job.ts:91,137`; `src/lib/hot-slots/slot-freed.ts:76`; `src/lib/auth/telegram-login-state.ts:75`) — ни разу для заполнения кэша.

**Импакт.** TTL слотов 120 с. У популярного мастера при 20 rps на истечении ключа все 20 запросов уходят в полный пересчёт (13 запросов каждый — PERF-04). **Фикс:** `setNx`-лок вокруг compute с коротким ожиданием и отдачей чуть протухшего значения. **Трудоёмкость:** M.

#### PERF-11 — Браузерный рантайм `@prisma/client` (66 kB parsed / 21 kB gzip) в клиентском бандле

```
### static/chunks/3069-2f76eb7616b9daef.js  parsed=66.0 gzip=21.0
       38.3 kB  node_modules/.prisma/client/index-browser.js
       34.5 kB  node_modules/@prisma/client/runtime/index-browser.js
```
Причина — **value**-импорты enum'ов (не `import type`) из 14 client-компонентов, например:
- `src/features/studio-cabinet/bookings/components/bookings-filters.tsx:5` — `import { BookingStatus } from "@prisma/client";`
- `src/features/master/components/notifications/notification-actions.tsx:6` — `import { NotificationType } from "@prisma/client";`
- `src/features/studio-cabinet/settings/components/profile-media-editor.tsx:3` — `import { MediaEntityType } from "@prisma/client";`
- `src/features/admin-cabinet/billing/components/payments-tab/payments-tab.tsx:6`, `.../plans-grid.tsx:5`, `.../subscriptions-tab/subscriptions-row.tsx:3`, `.../reviews/components/review-card.tsx:3`, `.../users/components/user-plan-pill.tsx:3`, `.../users/components/users-row.tsx:3`, `src/features/master/components/services/{bundle-row.tsx:5,modals/bundle-modal.tsx:6}`, `src/features/studio-cabinet/{notifications/components/notification-actions.tsx:7, schedule-requests/components/request-card.tsx:3, services/components/package-modal.tsx:5}`

`@prisma/client` в `serverExternalPackages` (`next.config.ts:77`) на клиентский граф не влияет — этот список только серверный. Формально это уже нарушение духа CLAUDE.md rule 13 (граница server/client), просто оно не роняет билд, а молча добавляет вес. **Фикс:** объявить нужные enum'ы как const-объекты в `*-shared.ts` (или `import type` + строковые литералы). **Трудоёмкость:** S.

#### PERF-12 — framer-motion импортируется полной бочкой во всех 57 файлах; `LazyMotion` не используется нигде

Чанк `3204` = 123.6 kB parsed / **40.6 kB gzip**, присутствует в манифестах `/`, `/catalog`, `/u/[username]`. `LazyMotion`/`domAnimation`/`m` — **0 вхождений** в `src/`. На лендинге framer попадает в начальную загрузку через статический импорт `src/features/home/components/hero-section.tsx:5`, поэтому `next/dynamic` на трёх других секциях (`landing-home.tsx:10-23`) его оттуда не убирает. Framer сидит и в общих примитивах — `src/components/ui/modal-surface.tsx:5`, `src/components/ui/drawer.tsx:12`, `src/components/layout/bottom-nav.tsx:7`, `src/components/layout/cookie-notice.tsx:5` — то есть на каждом маршруте.
**Фикс:** `<LazyMotion features={domAnimation} strict>` в корне + замена `motion.*` → `m.*`. Даёт примерно 2/3 веса framer'а. **Трудоёмкость:** M (механическая замена в 57 файлах).

#### PERF-13 — Ни один публичный API-ответ не несёт `Cache-Control`

Полный перебор `Cache-Control` в `src/`: 9 мест, из них публично-кэшируемое ровно одно — `src/app/api/cities/route.ts:21` (`public, max-age=300, s-maxage=300`). `src/lib/api/response.ts` (`ok()` `:23-25`) заголовок не ставит; глобальный `headers()` в `next.config.ts:123-143` — только security-заголовки.
Без заголовка идут: `/api/public/providers/[providerId]/slots`, `.../booking-days`, `.../review-summary`, `/api/public/services/[id]/booking-config`, `/api/public/stats`, `/api/catalog/{search,autocomplete,global-categories}`, `/api/home/{categories,tags,portfolio/[id]}`, `/api/reviews/tags`, `/api/search/services`, `/api/billing/plans`.
**Фикс:** для действительно статичных справочников (`/api/catalog/global-categories`, `/api/home/tags`, `/api/reviews/tags`, `/api/billing/plans`) — `public, s-maxage=300, stale-while-revalidate=600`. Слоты — `private, no-store` осознанно. **Трудоёмкость:** S.

#### PERF-14 — Middleware делает HTTP-fetch к собственному API на запросах с истёкшим access-токеном

```ts
// src/proxy.ts:203-208
const refreshRes = await fetch(refreshUrl.toString(), {
  method: "POST",
  headers: { cookie: request.headers.get("cookie") ?? "" },
});
```
Matcher (`src/proxy.ts:288-292`) покрывает всё, кроме `_next/static`, `_next/image`, favicon и статичных картинок. `PUBLIC_PATHS` (`:91`) выводит из-под этого `/login`, `/register`, `/api/auth/otp`, `/api/auth/refresh`, `/_next`, `/favicon` — остальное, включая `/`, `/catalog`, `/u/[username]`, проходит проверку. Для анонима (нет `bh_refresh`) fetch не делается; для залогиненного с протухшим 2-часовым access-токеном — делается, и это **полный HTTP round-trip к собственному приложению перед рендером**, плюс он же поднимает Prisma-запрос внутри `/api/auth/refresh`.
Отдельно: `checkRateLimit` (`:222`) — обращение к Redis почти на каждом запросе (`resolveRateLimitTier` возвращает `publicApi` для любого `/api/*`; для страниц — `null`, страницы не лимитируются).
**Фикс:** делать refresh не через HTTP, а вызовом функции (если рантайм middleware позволяет), либо не в middleware, а лениво на первом 401. **Трудоёмкость:** M. Никакого легаси Supabase в middleware нет (проверено) — но `next.config.ts:34` всё ещё содержит `runtimeCaching`-правило для `*.supabase.co/storage/...`, мёртвое (см. PERF-30).

#### PERF-15 — `ResilientImage` в fill-режиме по умолчанию ставит `sizes="100vw"`; 34 из 63 вызовов не передают `sizes`

```tsx
// src/components/ui/resilient-image.tsx:160-166
return (<Image src={src} alt={alt} fill sizes={sizes ?? "100vw"} … />);
```
Без `sizes` браузер запрашивает у оптимизатора вариант шириной во весь вьюпорт **для каждой картинки**, включая 40-пиксельные аватары. Среди вызовов без `sizes` — сеточные и списочные поверхности: `src/features/catalog/components/catalog-card.tsx` (2), `catalog-map-sidebar.tsx` (2), `src/features/public-profile/master/hero-block.tsx`, `src/features/public-studio/sections/details-section.tsx`, `src/features/master/components/model-offers/application-photos.tsx` (2), `src/features/search-by-time/components/provider-result-card.tsx`, `src/features/home/components/recent-masters-section.tsx`, плюс ~24 в кабинетах.
**Карточка каталога без `sizes` — это прямой удар по LCP каталога**, потому что оптимизатор отдаёт мобильному клиенту картинку под ширину десктопа.
**Фикс:** проставить `sizes` на всех сеточных/списочных вызовах; рассмотреть смену дефолта в `ResilientImage` на что-то консервативное с явным опт-ином на `100vw`. **Трудоёмкость:** S.

#### PERF-16 — `react-day-picker` + `date-fns` (80.7 kB parsed / 23.5 kB gzip) грузятся на `/catalog` статически

Чанк `210-1e334d318033de4b.js` = `react-day-picker` 212.0 + `date-fns` 104.8 + `@date-fns/tz` 16.9 kB. Проверено перебором манифеста: `/catalog` его тянет, `/` и `/u/[username]` — нет. Путь: `src/features/catalog/components/catalog-search-bar.tsx:5` → `date-preset-chips.tsx:5` (`import { DayPicker } from "react-day-picker"` + локаль `ru`). Календарь в каталоге открывается по клику — то есть это классический кандидат на `next/dynamic`.
**Фикс:** `dynamic(() => import(...), { ssr: false })` для календарной части `date-preset-chips`. **Трудоёмкость:** S.

#### PERF-17 — На весь проект один вызов `next/dynamic`

Единственный файл — `src/features/home/components/landing-home.tsx:3`, три вызова (`:10-13`, `:15-18`, `:20-23`), все с `ssr: false` + `loading`. Всё остальное грузится статически, в том числе тяжёлое и заведомо ниже сгиба:

| Виджет | Точка статического импорта |
|---|---|
| `react-easy-crop` (56.2 kB) | `src/features/media/components/crop-picker.tsx:4`, статически из 4 родителей (`crop-modal.tsx:5`, `avatar-editor.tsx:13`, `login-hero-image-manager.tsx:7`, `profile-media-editor.tsx:7`) |
| `qrcode.react` (43.8 kB) | `src/features/billing/components/public-settings-client.tsx:5`, `src/features/cabinet/components/share-profile-section.tsx:5` |
| `@tanstack/react-virtual` (32.7 kB) | `src/features/booking/components/slot-picker/slot-picker.tsx:4`, плюс `reschedule-modal.tsx:12-15` |
| Карта каталога (24.0 kB) | `catalog-page-client.tsx:17` |
| Модалка визуального поиска (24.2 kB) | `catalog-page-client.tsx:19` — **при `VISUAL_SEARCH_ENABLED=false`, т.е. код мёртвой фичи в бандле каталога** |
| Полноэкранный stories-viewer (21.1 kB) | `home-feed.tsx:12` |

**Фикс:** динамический импорт для кроппера, QR, карты, visual-search-модалки и stories-viewer. **Трудоёмкость:** M.

#### PERF-18 — `provider.updatedAt` — первый вход `scheduleVersion`, и его двигают события, не имеющие отношения к расписанию

`resolveScheduleVersion` (`src/lib/schedule/engine-context.ts:146-152`) берёт `max()` из пяти `updatedAt`, первый — `Provider.updatedAt`. Значит **любая** запись в строку провайдера осиротняет весь его кэш `slots:*` / `dayPlan:*` / `bookingDays:*` (все дни × все услуги × все длительности). Пишут в строку, в частности:
- `src/lib/reviews/service.ts:241` — пересчёт `ratingAvg`/`ratingCount` при **каждом** отзыве;
- `src/lib/schedule/recompute-available-today.ts:152` — воркер `availableToday`, который **сам запускается из инвалидатора слотов** (`slotsCache.ts:65,101` → `available-today-recompute-enqueue.ts`). Петля: бронь → инвалидация нужных дат → enqueue → воркер → `provider.updateMany` → новый `scheduleVersion` → **осиротел весь ключевой набор**, а не затронутые даты. Смягчено тем, что запись идёт только при смене значения (`recompute-available-today.ts:148`);
- `src/lib/master/profile.service.ts:401,427,435,449,463,484`, `src/lib/studios/{studio.ts:195,masters.ts:58,82}`, `src/lib/studio/masters.service.ts:119,318`, `src/lib/invites/service.ts:111,119`, `src/lib/providers/settings.ts:86`.

Плюс `publishedUntilLocal` в том же ключе (`src/lib/schedule/publish-horizon.ts:20-21`) катится по стенным часам → **каждую локальную полночь салона весь кэш этого провайдера холодный**.

Корректности это не нарушает (осиротевшее не отдаётся) — это стоимость: hit-rate кэша слотов заметно ниже, чем предполагает TTL 120 с. **Фикс:** сузить версию до полей, реально влияющих на расписание (отдельная колонка `Provider.scheduleVersion`, инкрементируемая только редакторами расписания), вместо `updatedAt` всей строки. **Трудоёмкость:** M.

#### PERF-20 — AI-ответы полностью буферизуются, стриминга нет

`src/lib/ai/client.ts:155` — `await getClient().chat.completions.create(…)` без `stream: true`; `AI_TIMEOUT_MS = 15_000` (`:47`), `AI_MAX_RETRIES = 1` (`:48`). Все четыре поверхности (`src/lib/advisor/ai-advice.ts:11`, `src/lib/ai/review-reply.ts:15`, `src/lib/ai/review-summary.ts:67`, `src/lib/ai/service-description.ts:15`) ждут полный ответ.
Все четыре — вспомогательные (кнопка «сгенерировать», сводка отзывов, советник), не диалоговый чат в реальном времени, поэтому P2, а не P1. Сводка отзывов дополнительно кэшируется на сутки (`review-summary.ts:10,14`), советник — тоже (`src/lib/advisor/cache.ts:5`, TTL 86400). **Фикс:** стриминг для «советника» и генерации описания услуги, где ожидание видит человек. **Трудоёмкость:** M.

#### PERF-21 — `delByPattern` сканирует весь keyspace Redis на каждую инвалидацию мастера

```ts
// src/lib/cache/redisClient.ts:52-61
let cursor = "0";
do {
  const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
  …
} while (cursor !== "0");
```
`SCAN` не блокирует (в отличие от `KEYS`) — это правильно. Но `MATCH` фильтрует **после** выборки, поэтому `slots:${masterId}:*` обходит весь keyspace порциями по 100. В том же Redis живут окна rate-limit, сессии, `dayPlan:*`, идемпотентность, pub/sub — при сотнях тысяч ключей это тысячи round-trip'ов на каждый вызов `invalidateSlotsForMaster` (а он дёргается из каждого редактора расписания и из `enqueueAvailableTodayRecompute`).
Смягчение уже есть: `invalidateSlotsForDateKeys` (`src/lib/schedule/slotsCache.ts:68-80`) сначала пробует индекс `slotsIndex:` и уходит в `delByPattern` только как fallback. Но `invalidateSlotsForMaster` (`:59`) идёт в паттерн всегда.
**Фикс:** держать per-master множество ключей (Redis SET) и удалять по нему; либо `COUNT` побольше; либо префиксовать слот-ключи так, чтобы их можно было выселять через отдельную логическую БД Redis. **Трудоёмкость:** M.

#### PERF-22 — Списочные эндпоинты и рейлы без `take`

Отобраны те, что на пользовательских путях (полный список — 162 сайта, здесь то, что реально растёт):
- `src/app/api/favorites/route.ts:14` — `userFavorite.findMany({ where: { userId, provider: { isPublished: true } }, include: { provider: {…} } })`, без `take`.
- `src/lib/favorites/get-favorites.ts:11` и `:24` — без `take`; вызывается из `src/features/catalog/pages/catalog-page.tsx:15` **на каждый показ каталога**.
- `src/lib/feed/stories.service.ts:67` — `portfolioItem.findMany` для рейла сторис на главной, без `take`.
- `src/lib/client-cabinet/favorites.service.ts:62` — `portfolioItem.findMany({ masterId: { in: providerIds } })`; в комментарии написано «plenty fast for N≤200 favorites», но 200 нигде не enforced.
- `src/lib/chat/conversation-aggregator.ts:351` — самая глубокая цепочка в проекте: `booking` (без take) → `chat` → **`messages` (без take, `orderBy createdAt asc`)** → `referencedBooking` → `provider`/`masterProvider`/`serviceItems`. Открытие чат-листа материализует всю переписку по всем броням пары.
- `src/app/api/providers/[id]/masters/route.ts:43` и `:63`; `src/app/api/analytics/masters/route.ts:29`; `src/lib/notifications/service.ts:645`; `src/lib/master/bookings.service.ts:271` (`review.findMany` по `bookingId in`).

Клиентские лимиты **клампятся** везде, где приходят от пользователя (zod `.max()` в 10+ роутах, `Math.min` в 11 местах, `clampPageSize` в слот-пути) — прямого «take из query без клампа» не найдено. Проблема именно в серверных запросах без лимита вообще. **Трудоёмкость:** M.

#### PERF-23 — `getSessionUser` тянет полную строку `UserProfile` на каждый аутентифицированный запрос

```ts
// src/lib/auth/session.ts:64-68
async function loadActiveSessionUser(userId: string) {
  return prisma.userProfile.findFirst({
    where: { id: userId, isDeleted: false },
  });
}
```
Без `select` — все колонки, включая длинные текстовые. Вызывается из `getSessionUser()`/`getSessionUserId()` практически в каждом защищённом роуте и в SSR публичных страниц (`src/app/page.tsx:18`, `src/app/(public)/models/[code]/page.tsx:49`, `src/app/catalog/page.tsx` через `getSessionUserId`). Тот же полный-строкой паттерн — в `src/lib/users/find-or-create-guest.ts:33`, `src/lib/auth/{telegram-login.ts:45,phone-login-profile.ts:48,email-login-profile.ts:46}`, `src/app/api/auth/otp/verify/route.ts:97`, `.../otp/email/verify/route.ts:78`, `.../yandex/callback/route.ts:172`, `.../vk/callback/route.ts:209`.
**Фикс:** явный `select` под фактических потребителей; при желании — короткий Redis-кэш (в проекте уже есть `me:${userId}` TTL 30 с, `src/lib/users/me.ts:15,18` — но это другой путь). **Трудоёмкость:** S.

---

### P3 🔵

#### PERF-19 — `dayPlan:*` / `bookingDays:*` не инвалидируются никогда; `TimeBlock.updatedAt` вне `scheduleVersion`

Подробности — в разделе «Гэпы инвалидации кэша». Сегодня протухания нет (в `DayPlan` нет ни броней, ни блоков — `src/lib/schedule/engine.ts:39-53`; `bookingDays` возвращает только рабочие дни). Записываю как P3 потому, что это **необеспеченный инвариант**: он держится на текущем содержимом `DayPlan`, а не на механизме. Плюс `TimeBlock` защищён только явными вызовами, а `delByPattern` глотает ошибки Redis (`src/lib/cache/redisClient.ts:62-67`). **Фикс:** либо добавить `TimeBlock` в `resolveScheduleVersion`, либо завести `invalidateDayPlanForMaster` и вызывать её рядом со слотовой. **Трудоёмкость:** S.

#### PERF-24 — Независимые `await` выполняются последовательно на горячих путях

Проверенные точки: `src/lib/schedule/resolveDuration.ts:9` и `:17` (два независимых `findUnique`; третий на `:39` действительно зависит — **умножается на N в PERF-08**); `src/lib/master/bookings.service.ts:243` (`provider.findUnique` за timezone — после `Promise.all` на `:174`, хотя зависит только от `input.masterId`); `src/app/api/master/clients/route.ts:28-29`; `src/app/(cabinet)/cabinet/billing/page.tsx:56,62` и `:108,115,120`; `src/app/(public)/models/[code]/page.tsx:46,49`; `src/app/(public)/u/[username]/booking/page.tsx:263,282`; `src/app/(cabinet)/cabinet/studio/analytics/page.tsx:39-40`.
Много мест уже распараллелено правильно (`src/app/page.tsx:17`, `src/app/(public)/u/[username]/page.tsx:240,252`, `src/lib/catalog/catalog.service.ts:261,301,319`). **Трудоёмкость:** S.

#### PERF-25 — 435 файлов с `"use client"`; 22 из них — статичные RSC-кандидаты

Ни одного хука, обработчика или `addEventListener`; только props → JSX. На публичных путях: `src/features/public-studio/studio-booking-flow/components/booking-hero.tsx:1` (145 строк), `.../booking-error.tsx:1`, `.../steps-bar.tsx:1`, `src/features/search-by-time/components/provider-result-card.tsx:1`, `src/components/auth/{vk-login-button.tsx:1,yandex-login-button.tsx:1}`, `src/components/ui/{chip-button.tsx:1,social-link-preview.tsx:1}`, `src/components/billing/PaywallCard.tsx:1`. Остальные — в кабинетах и админке (`schedule-settings/*`, `admin-cabinet/dashboard/{bookings,registrations}-chart.tsx:1` — обёртки без хуков вокруг `ChartCard`, у которого своя граница). **Трудоёмкость:** S за штуку, эффект — маленький, но бесплатный.

#### PERF-26 — Cron review-prompts: 200 итераций × 2 round-trip'а последовательно

```ts
// src/lib/bookings/review-prompts.ts:31-36
for (const item of candidates) {
  if (notifiedSet.has(item.id)) continue;
  const booking = await loadBookingWithRelations(item.id);   // findUnique + 4 relations
  if (!booking) continue;
  await notifyBookingCompletedReview(booking);               // create notification + push
```
`take: 200` на `:17`. Это воркер, не пользовательский путь, поэтому P3 — но при 200 бронях это до 400 последовательных round-trip'ов в одном проходе. Родственные: `src/lib/notifications/service.ts:124` (создание уведомлений по одному в цикле), `src/lib/billing/price-optin-cron.ts:83,114`, `src/lib/hot-slots/{job.ts:55,smart-price-job.ts:109}`. **Трудоёмкость:** M.

#### PERF-27 — Дашборд админки опрашивает API каждые 5 секунд

`src/features/admin-cabinet/dashboard/components/events-feed.tsx:12` — `const POLL_MS = 5_000;`, используется на `:77-80`. Соседний `system-health.tsx:10` — 30 с, приемлемо. Глобальный SWR настроен консервативно (`src/components/providers/swr-provider.tsx:11-16`: `revalidateOnFocus: false`, `revalidateOnReconnect: false`, `dedupingInterval: 10_000`), и единственный `refreshInterval` в SWR — 30 с (`src/features/client-cabinet/notifications/client-notifications-page.tsx:83`). То есть 5-секундный `setInterval` в админке — единственный выброс. В проекте уже есть SSE (`/api/notifications/stream`) — логичнее переключить ленту событий на него. **Трудоёмкость:** S.

#### PERF-28 — На `/login` одновременно крутятся 13 бесконечных CSS-анимаций, три из них не композитные

`src/app/globals.css:543-557` — 13 правил `… infinite`, все под `@media (prefers-reduced-motion: no-preference)` (`:541`) — это сделано правильно. Свойства (`:563-582`) в основном `transform`/`opacity`, но три исключения бьют по paint каждый кадр:
- `:566` `login-sheen` — `background-position`
- `:569` `login-text-shimmer` — `background-position` на элементе с `background-clip: text` (`:494-503`)
- `:568` `login-pulse-dot` — `box-shadow`

Пауза при уходе мыши есть только у маркизы (`:559` `.login-mq-zone:hover … paused`). Showcase-панель — только desktop (`sizes="(min-width: 1024px) 480px, 1px"`, `src/app/login/login-showcase.tsx:310`), мобильные не затронуты. Пересекается с проходом 05 (визуал/анимации) — там глубже, здесь только перф-факт. **Трудоёмкость:** S.

#### PERF-29 — Каждый воркер сборки открывает соединения с Redis во время `next build`

В логе сборки — ~30 записей `{"message":"Redis client connected"}` на фазе «Collecting page data using 15 workers» / «Generating static pages using 15 workers», плюс `{"message":"Cache client selected","driver":"redis"}`. Причина — `import "@/lib/startup"` и `ensureVisualSearchStartupConfig()` на уровне модуля в `src/app/layout.tsx:1,33`, исполняющиеся при сборе данных страницы. Билд от этого не падает и время не растёт заметно, но: сборка требует доступного Redis, а в CI/Docker его может не быть. Стоит проверить на прод-пайплайне. **Трудоёмкость:** S.

#### PERF-30 — Мёртвое правило Service Worker для Supabase Storage

`next.config.ts:33-46` — `runtimeCaching` с `urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i` (`StaleWhileRevalidate`, 60 записей). Supabase в проекте не используется (`MASTERRYADOM_AI_CONTEXT.md` §11: «Supabase не используется»); медиа идут через `storage.yandexcloud.net` (`next.config.ts:102`). Правило никогда не срабатывает, зато **правила для `storage.yandexcloud.net` нет** — картинки ловятся только общим правилом по расширению (`:47-60`), которое покрывает и `next/image`-URL'ы вида `/_next/image?url=…` **не** покрывает (у них нет расширения в пути). То есть оптимизированные картинки SW не кэширует вовсе. **Фикс:** заменить Supabase-правило на правило для `/_next/image` и/или `storage.yandexcloud.net`. **Трудоёмкость:** S.

---

## Известные открытые — верифицированный статус

| Пункт | Статус по коду |
|---|---|
| Гэпы enforcement `minBookingHoursAhead` / `slotPrecision` / `lateCancelAction` | **Подтверждено как известное.** `minBookingHoursAhead` фигурирует в `assertBookingWindow` и в polling-пути, `slotPrecision` селектится в каталоге (`catalog.service.ts`) и в `usecases.ts:293` не участвует в расчёте. Перф-импакта нет — не открываю как новую находку |
| OTP в логах (намеренно) | Не трогал. Перф-импакта нет |
| VK Bot delivery не реализован | Не трогал |
| Версия pgvector на проде не подтверждена | **Подтверждаю актуальность.** `prisma/schema/migrations/20260713120000_…/migration.sql:20-24` создаёт `USING hnsw`, что требует pgvector ≥ 0.5.0; комментарий в самой миграции это фиксирует. При `VISUAL_SEARCH_ENABLED=false` и 0 векторов перф-риска на запуск нет — но `migrate deploy` на площадке без hnsw **упадёт**, и это операционный вопрос (`DEPLOY-BACKLOG.md`), не мой |

Из списка «уже починено — не переоткрывать» ничего не регрессировало по моей области. Отдельно проверил и подтверждаю **отсутствие** регрессий: `prisma-direct` не импортируется из клиентского графа; `NEXT_PUBLIC_*` build-args присутствуют; `@sentry/node` корректно вынесен в `serverExternalPackages` + `webpack.externals` (`next.config.ts:74-92`, `:157-168`) и в клиент не попал.

---

## Гипотезы — не доказано

Всё ниже требует запущенного инстанса или прод-объёма данных. Ни одно из этих утверждений **не** является находкой.

| # | Гипотеза | Как проверить |
|---|---|---|
| H-1 | Публичный профиль мастера отдаёт TTFB > 500 мс из-за PERF-01 + PERF-04 | На стейдже с прод-подобным объёмом: `for i in {1..50}; do curl -o /dev/null -s -w "%{time_starttransfer}\n" https://<host>/u/<username>; done`, взять p50/p95. Порог: p95 < 800 мс |
| H-2 | Каталог на 4 400 провайдерах ранжирует > 300 мс в Node | Сгенерировать 4 400 `Provider` в стейдж-БД, замерить `searchCatalog` вокруг `resolveRelevanceRankedPage` через `logInfo` с `performance.now()`. Порог: < 150 мс |
| H-3 | Индексы I-1..I-3 меняют план с Seq/Sort на Index Scan | На стейдже: `EXPLAIN (ANALYZE, BUFFERS) SELECT … FROM "Booking" WHERE "masterProviderId"=$1 AND "startAtUtc" BETWEEN $2 AND $3 AND "status" NOT IN (…) ORDER BY "startAtUtc" ASC;` — до и после `CREATE INDEX`. Критерий: исчезновение узла `Sort` и падение `shared read` |
| H-4 | ILIKE-поиск услуг деградирует до Seq Scan на десятках тысяч `Service` | `EXPLAIN ANALYZE SELECT … FROM "Service" WHERE "name" ILIKE '%маникюр%' OR "title" ILIKE '%маникюр%';` при ≥ 50 000 строк; затем `CREATE EXTENSION pg_trgm; CREATE INDEX … USING gin ("name" gin_trgm_ops);` и повтор |
| H-5 | Виджет студии выдаёт ~105 запросов на клик (PERF-08) | Включить `PRISMA_LOG=query` (или `prisma.$on('query')`) на стейдже, открыть виджет Vision Beauty Studio, посчитать запросы за один вызов `/slots`-агрегатора |
| H-6 | Lighthouse-цели | `npm run lighthouse` (`scripts/lighthouse-audit.ts` уже есть) против прод-билда, мобильный профиль, throttling Slow 4G. Цели: **LCP ≤ 2.5 с, CLS ≤ 0.1, INP ≤ 200 мс, TBT ≤ 300 мс** на `/`, `/catalog`, `/u/<username>`. **Важно:** контекст создавать с `serviceWorkers: "block"` — в прод-билде SW живой и precache отравляет повторные прогоны (зафиксировано в QA-003) |
| H-7 | Hit-rate кэша слотов заметно ниже ожидаемого из-за PERF-18 | Инструментировать `getCachedSlots` счётчиком hit/miss в Redis (`INCR`), снять за сутки. Ожидание при исправном кэше — > 70 %; гипотеза: будет < 30 % |
| H-8 | Оптимизатор `next/image` — узкое место CPU при 100× портфолио | Нагрузочный прогон каталога с холодным кэшем оптимизатора, снять CPU app-контейнера и время ответа `/_next/image` |
| H-9 | `delByPattern` при большом keyspace даёт заметную задержку сохранения расписания | На стейдже залить 500 000 фиктивных ключей, замерить `invalidateSlotsForMaster` |

---

## Предлагаемые записи в BACKLOG.md

> **`BACKLOG.md` намеренно не изменён** (параллельно идут ещё 4 аудита). Готовые строки — владелец вмержит сам. Deploy/ops-пунктов здесь нет; всё код-задачи (CLAUDE.md rule 15).

```markdown
### 🟠 P1 — производительность (AUDIT-FRESH-04)

- [ ] **PERF-01-STATIC-ROUTES** — корневой layout (`src/app/layout.tsx:180,189`) читает `headers()` + `cookies()`, из-за чего ВСЕ страничные роуты `ƒ Dynamic` (статикой в сборке остались 2 из 92: `/robots.txt` и `/sitemap.xml`). Ни ISR, ни CDN-кэш HTML невозможны даже для `/terms`, `/privacy`, `/about`, `/faq`. Минимальный шаг: route-группа для чисто статичных страниц со своим layout без dynamic-API. [M]
- [ ] **PERF-02-UI-TEXT-SPLIT** — `src/lib/ui/text.ts` (454.7 kB, 81 kB gzip) едет в браузер на каждом роуте одним чанком `9121`; это 41 % first-load-JS лендинга. Разрезать на доменные модули с ре-экспортом `UI_TEXT`. Инвариант #13 не трогается — меняется раскладка по файлам, не источник истины. [L]
- [ ] **PERF-03-ZOD-OFF-CLIENT** — `zod` (523.9 kB) сидит в `855-*.js`, который в `rootMainFiles` → грузится на каждой странице, включая `/terms`. Вынести клиентские схемы в `*-shared.ts`, типы — через `import type`. [M]
- [ ] **PERF-04-SLOTS-DB-COST** — публичный `/slots` делает 13 запросов к БД ДО чтения кэша (`usecases.ts:291,301,311,358`; `createScheduleContext` = 10 round-trip'ов, из них 5 — только чтобы вычислить `scheduleVersion`). Кэш экономит CPU, но не БД. React `cache()` на контекст + кэш `scheduleVersion` в Redis. [M]
- [ ] **PERF-05-CATALOG-RANKING-SCALE** — `catalog.service.ts:262,301,366` тянут ВЕСЬ отфильтрованный набор провайдеров без `take` и ранжируют в Node (при price-сорте — вместе со всеми услугами). Комментарий на `:253` это признаёт. Денормализованная `Provider.rankScore` + `priceFromEffective`; быстрый шаг — `take: 8` на `services`/`masterServices` в карточном select. [L / S]
- [ ] **PERF-06-CRM-UNBOUNDED-HISTORY** — `studio/clients.service.ts:102` и `master/clients-view.service.ts:263` грузят пожизненную историю броней арендатора без `take` (+ вложенный `serviceItems` без `take`). Агрегаты в `groupBy`, список — курсором. [M]
- [ ] **PERF-07-MEDIA-RESIZE** — в аплоад-пайплайне НЕТ `.resize()` (`api/media/route.ts:93-102`, `chat/upload-attachment:90`, `bookings/upload-reference:79`); хранятся оригиналы до 10 МБ, а вложения чата отдаются в браузер как есть (`message-bubble.tsx:56-61` — raw `<img>` в бокс 200 px). Добавить `resize({ width, withoutEnlargement: true })`. [S]
- [ ] **PERF-08-STUDIO-SLOTS-N1** — `studio-slot-aggregation.ts:101` даёт M × (2 + 13) запросов на открытие виджета студии (~105 при 7 мастерах). Тот же паттерн: `search-by-time/service.ts:297`, `recent-masters.ts:129`. Свести к пакетным запросам по `masterIds`. [L]
- [ ] **PERF-09-MISSING-INDEXES** — одной миграцией: `Booking(masterProviderId, startAtUtc)`, `Booking(clientUserId, startAtUtc desc)`, `Booking(studioId, startAtUtc desc)`, `Provider(cityId, isPublished, ratingAvg desc, reviews desc, createdAt desc)`, `Review(targetType, targetId, deletedAt, createdAt desc)`. Только `migrate dev`; проверить, что не уехал `DROP INDEX` hnsw. [S]

### 🟡 P2 — производительность (AUDIT-FRESH-04)

- [ ] **PERF-10-CACHE-STAMPEDE** — нет single-flight ни на одном пути промаха (`usecases.ts:380,520`; `engine.ts:22`; `booking-days/route.ts:49`; `advisor/cache.ts:18`). `setNx` в проекте есть, но для кэша не используется. [M]
- [ ] **PERF-11-PRISMA-IN-CLIENT** — браузерный рантайм Prisma (66 kB parsed) в бандле из-за value-импортов enum'ов в 14 client-компонентах. Заменить на const-объекты в `*-shared.ts`. [S]
- [ ] **PERF-12-LAZY-MOTION** — framer-motion полной бочкой во всех 57 файлах, `LazyMotion` не используется нигде; чанк 40.6 kB gzip на каждом роуте. [M]
- [ ] **PERF-13-PUBLIC-CACHE-CONTROL** — ни один `/api/public/**` и `/api/catalog/**` не ставит `Cache-Control`; единственный публично-кэшируемый ответ в проекте — `/api/cities`. [S]
- [ ] **PERF-14-MIDDLEWARE-FETCH** — `src/proxy.ts:203` делает HTTP-fetch к `/api/auth/refresh` из middleware при протухшем access-токене, до рендера страницы. [M]
- [ ] **PERF-15-IMAGE-SIZES** — `ResilientImage` по умолчанию `sizes="100vw"` (`resilient-image.tsx:165`); 34 из 63 вызовов `sizes` не передают, включая карточки каталога — прямой удар по LCP каталога на мобильных. [S]
- [ ] **PERF-16-DAYPICKER-DYNAMIC** — `react-day-picker` + `date-fns` (23.5 kB gzip) статически в бандле `/catalog` через `catalog-search-bar.tsx:5`. [S]
- [ ] **PERF-17-DYNAMIC-IMPORTS** — на весь проект один `next/dynamic` (`landing-home.tsx:3`). Динамизировать: кроппер, QR, карту каталога, visual-search-модалку (мёртвая фича при `VISUAL_SEARCH_ENABLED=false`, но 24 kB в бандле), stories-viewer. [M]
- [ ] **PERF-18-SCHEDULE-VERSION-CHURN** — `Provider.updatedAt` — первый вход `scheduleVersion`, его двигают отзывы, `availableToday`-воркер (запускаемый самим же инвалидатором) и любые правки профиля → весь кэш провайдера осиротевает. Отдельная колонка `Provider.scheduleVersion`. [M]
- [ ] **PERF-20-AI-STREAMING** — `ai/client.ts:155` без `stream: true`, таймаут 15 с; советник и генерация описания заставляют человека ждать полный ответ. [M]
- [ ] **PERF-21-DELBYPATTERN-SCAN** — `invalidateSlotsForMaster` всегда идёт в `delByPattern` (SCAN по всему keyspace), в отличие от `invalidateSlotsForDateKeys`, у которого есть индекс. [M]
- [ ] **PERF-22-UNBOUNDED-LISTS** — `findMany` без `take` на пользовательских путях: `/api/favorites:14`, `favorites/get-favorites.ts:11,24` (на каждый показ каталога), `feed/stories.service.ts:67`, `conversation-aggregator.ts:351` (вся переписка пары), `providers/[id]/masters/route.ts:43,63`. [M]
- [ ] **PERF-23-SESSION-SELECT** — `session.ts:64` тянет полную строку `UserProfile` на каждый аутентифицированный запрос; тот же паттерн в 9 auth-путях. [S]

### 🔵 P3 — производительность (AUDIT-FRESH-04)

- [ ] **PERF-19-DAYPLAN-INVALIDATION** — `dayPlan:*` / `bookingDays:*` не удаляет ни один путь; `TimeBlock.updatedAt` вне `scheduleVersion`. Сегодня не протухает, но инвариант ничем не обеспечен. [S]
- [ ] **PERF-24-PARALLEL-AWAITS** — независимые `await` последовательно в `resolveDuration.ts:9,17` (умножается на N в PERF-08), `master/bookings.service.ts:243`, `cabinet/billing/page.tsx:56,62`, `models/[code]/page.tsx:46,49` и др. [S]
- [ ] **PERF-25-RSC-CANDIDATES** — 22 client-компонента без единого хука/обработчика, в т.ч. на публичном пути бронирования студии. [S]
- [ ] **PERF-26-CRON-SEQUENTIAL-LOOPS** — `review-prompts.ts:31` — 200 итераций × 2 round-trip'а последовательно; аналогично `notifications/service.ts:124`, `price-optin-cron.ts:83,114`, `hot-slots/job.ts:55`. [M]
- [ ] **PERF-27-ADMIN-5S-POLL** — `admin-cabinet/dashboard/events-feed.tsx:12` опрашивает API каждые 5 с; в проекте уже есть SSE. [S]
- [ ] **PERF-28-LOGIN-PAINT-ANIMATIONS** — из 13 бесконечных анимаций `/login` три не композитные (`globals.css:566,568,569` — `background-position` ×2, `box-shadow`). Пересечение с проходом 05. [S]
- [ ] **PERF-29-BUILD-REDIS** — сборка открывает ~30 соединений с Redis (`layout.tsx:1,33` исполняются при сборе данных страницы); проверить, что прод-пайплайн это переживает. [S]
- [ ] **PERF-30-SW-CACHE-RULES** — `next.config.ts:34` кэширует несуществующий Supabase Storage, а `storage.yandexcloud.net` и `/_next/image` SW не кэширует вовсе. [S]
```

---

## План фиксов

Порядок — по «выигрыш / риск». Каждый пункт = один коммит.

| # | FIX-промпт | Содержание | Почему здесь |
|---|---|---|---|
| 1 | **FIX-PERF-INDEXES** | PERF-09. Одна миграция с пятью композитными индексами | Нулевой риск для поведения, чистый выигрыш, не конфликтует ни с чем из параллельных аудитов |
| 2 | **FIX-PERF-MEDIA-RESIZE** | PERF-07. `.resize()` в трёх аплоад-роутах | Три строки, ограничивает и хранилище, и вход оптимизатора, и вложения чата |
| 3 | **FIX-PERF-IMAGE-SIZES** | PERF-15. `sizes` на всех сеточных `ResilientImage`, начиная с карточек каталога | Прямой LCP каталога, чисто разметочная правка |
| 4 | **FIX-PERF-CATALOG-CARD-TAKE** | PERF-05, быстрая половина: `take: 8` на `services`/`masterServices`/`masters` в карточном `select` | Снимает худшее over-fetch каталога без схемы |
| 5 | **FIX-PERF-STATIC-LEGAL** | PERF-01, минимальный вариант: route-группа для `/terms`, `/privacy`, `/consent`, `/about`, `/faq`, `/help`, `/blog`, `/careers`, `/gift-cards`, `/how-*` с layout без `cookies()`/`headers()` | Юрдокументы становятся статикой; трогает только эти маршруты, CSP на динамике не задет |
| 6 | **FIX-PERF-SLOTS-DB** | PERF-04. React `cache()` на `createScheduleContext` + кэш `scheduleVersion` в Redis + проверка кэша до загрузки броней | Ядро booking-флоу; делать после того, как индексы уже лягут |
| 7 | **FIX-PERF-PRISMA-CLIENT-ENUMS** | PERF-11. Enum'ы из `@prisma/client` → const-объекты в `*-shared.ts` в 14 файлах | Механическая правка, заодно закрывает дыру в границе rule 13 |
| 8 | **FIX-PERF-DYNAMIC-IMPORTS** | PERF-16 + PERF-17. `next/dynamic` для day-picker, кроппера, QR, карты, visual-search-модалки, stories-viewer | Заметный выигрыш на `/catalog` и в кабинетах |
| 9 | **FIX-PERF-LAZY-MOTION** | PERF-12. `LazyMotion` + `m.*` | Механическая замена в 57 файлах — отдельный коммит, чтобы дифф был читаемым |
| 10 | **FIX-PERF-ZOD-CLIENT** | PERF-03. Вынести клиентские схемы, типы через `import type` | Требует аккуратной трассировки импортов |
| 11 | **FIX-PERF-UI-TEXT-SPLIT** | PERF-02. Разрезать `text.ts` по доменам | Самый крупный выигрыш и самый крупный дифф — делать последним из бандл-задач, когда остальное уже стабильно |
| 12 | **FIX-PERF-CRM-PAGINATION** | PERF-06. `groupBy` + курсор в CRM-списках | Требует продуктового решения по UI пагинации |
| 13 | **FIX-PERF-STUDIO-SLOTS-BATCH** | PERF-08. Пакетные запросы в агрегаторе слотов студии | Самая крупная и рискованная; делать после FIX-PERF-SLOTS-DB, который часть работы уже снимет |
| 14 | **FIX-PERF-CACHE-HYGIENE** | PERF-10 + PERF-18 + PERF-19 + PERF-21 одной пачкой | Все четыре — один модуль (`slotsCache`/`engine-context`/`redisClient`), логично одним заходом |
| 15 | **FIX-PERF-MISC** | PERF-13, PERF-22, PERF-23, PERF-24, PERF-27, PERF-30 | Мелочь, безопасно собрать в один коммит |

---

## 🚨 Pre-launch риски, за которыми следить

1. **Безлимитные запросы, деградирующие с ростом данных.** Три класса, все подтверждены кодом: (а) ранжирование каталога тянет **весь** отфильтрованный набор провайдеров в Node на каждый показ, а при ценовой сортировке — ещё и все их услуги (`catalog.service.ts:262,301,366`); (б) CRM-страницы мастера и студии грузят **пожизненную** историю броней без `take` (`master/clients-view.service.ts:263`, `studio/clients.service.ts:102`), с вложенным `serviceItems` тоже без `take`; (в) чат-агрегатор материализует **всю переписку** по всем броням пары (`conversation-aggregator.ts:351`). Каталог — вопрос конверсии, CRM — вероятнейший OOM-кандидат приложения. **Наблюдать: RSS Node-контейнера и p95 `/catalog` сразу после открытия трафика.**

2. **Пропущенные пути инвалидации кэша слотов (корректность, не только перф).** Полный перебор путей записи показал: **протухания слотов нет** — все 8 путей создания брони, все переносы/отмены/подтверждения, все редакторы расписания и все три записи `TimeBlock` вызывают инвалидатор. Но два обстоятельства оставляют это без запаса прочности: (а) `TimeBlock.updatedAt` **не входит** в `scheduleVersion` (`engine-context.ts:124-146`), поэтому блоки защищены **только** явными вызовами, а `delByPattern` молча глотает любую ошибку Redis (`redisClient.ts:62-67`) — один упавший SCAN = до 120 с бронируемых слотов поверх блока; (б) `dayPlan:*` и `bookingDays:*` не удаляет **ни один** путь в репозитории, и сегодня это безопасно исключительно потому, что в `DayPlan` пока нет ни броней, ни блоков (`engine.ts:39-53`). **Оба — необеспеченные инварианты: они держатся на текущем содержимом структур, а не на механизме.** Правило: любое расширение `DayPlan` или новое поле, влияющее на слоты, обязано либо войти в `resolveScheduleVersion`, либо получить явную инвалидацию.

3. **Полностью динамические публичные страницы.** Статикой в сборке остались **2 страничных роута из 92** — `/robots.txt` и `/sitemap.xml`. Всё остальное, включая юрдокументы и маркетинг, рендерится на каждый запрос, и починить это в самом сегменте нельзя: причина в корневом layout (`layout.tsx:180,189`). Для маркетплейса с преимущественно анонимным трафиком это означает, что самый дешёвый рычаг масштабирования — CDN-кэш HTML — сейчас недоступен в принципе. **Наблюдать: нагрузку на Postgres от анонимных просмотров профилей — это тот же трафик, который у конкурента обслуживался бы из кэша.**

4. **Отдача медиа в оригинальном размере.** `.resize()` в аплоад-пайплайне нет вообще (единственный в `src/` — для эмбеддингов visual-search). Хранятся оригиналы до 10 МБ. Для портфолио браузер спасает `next/image`, но оптимизатор при каждом промахе тянет 10-мегабайтный файл из S3 и жмёт его на CPU app-сервера. Для вложений чата защиты нет вовсе: `raw <img>` (осознанно, из-за токена в URL) грузит оригинал в бокс высотой 200 px. **Наблюдать: CPU app-контейнера и объём кэша оптимизатора после наполнения портфолио реальными фото.**

5. **Дополнительно к заданному списку — стоимость слот-эндпоинта.** Публичный `/slots` выполняет 13 запросов к БД **до** обращения к кэшу, пять из которых существуют только чтобы вычислить ключ кэша. Виджет студии умножает это на число мастеров. Это самый горячий эндпоинт booking-флоу, и его кэш сегодня не делает того, ради чего кэши заводят. **Наблюдать: число запросов к Postgres на одну бронь и утилизацию пула соединений Prisma.**

---

### Context updates

**Не затронуто.** Аудит read-only: схема, роуты, env и core-flows не менялись — ни один структурный триггер из таблицы `docs/QUALITY-GATES.md` § «Обновление контекста» не сработал. `MASTERRYADOM_AI_CONTEXT.md` править не требуется.

Два наблюдения, которые станут поводом для правки контекста **только когда соответствующий фикс будет сделан** (сейчас вносить нечего — это состояние, а не изменение):
- §11 «Производительность» описывает кэш слотов как работающий слой; фактическая стоимость (13 запросов до чтения кэша) там не отражена. Уточнить в §11 при закрытии PERF-04.
- §8 «Технический долг» не упоминает ни отсутствие статических страниц, ни отсутствие ресайза медиа. Дописать при закрытии PERF-01 / PERF-07.

`BACKLOG.md` **не изменён** намеренно (параллельно идут ещё четыре аудита) — готовые строки выше, вмерживает владелец. Deploy/ops-пунктов в предложенных записях нет: всё перечисленное — код-задачи (CLAUDE.md rule 15).
