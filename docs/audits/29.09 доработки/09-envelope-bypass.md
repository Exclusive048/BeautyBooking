# 09 · Ручные конверты ошибок на сервере

**Источник:** `ENVELOPE-BYPASS-TRIAGE-02` (BACKLOG) · **Тип:** рефакторинг · **Объём:** S
**Зависит от:** —

## Что не так

Сторож `src/lib/api/error-envelope-bypass.test.ts` (путь в BACKLOG устарел — не `api/…`, а `lib/api/…`) держит замороженный инвентарь ответов, собранных мимо `fail()` / `jsonFail()`. Прогон на 2026-09-29 — зелёный, инвентарь: 4 файла / 12 сайтов. `src/proxy.ts` (3) ратифицирован FIX-B18; три других файла **заморожены, но не разобраны**:

**`src/app/api/health/worker/route.ts` — 6 сайтов, а не «английские ×4 + 1», как в BACKLOG.** Посайтово:
- `:30` — `Response.json({ error: "Service unavailable" }, { status: 503 })`, в проде не задан `WORKER_SECRET`;
- `:37` — `{ error: "Unauthorized" }`, 401, неверный секрет;
- `:50` и `:62` — `"Service unavailable"`, 503, POST-пинг воркера не смог записать отметку в Redis;
- `:75` и `:107` — `{ alive: false, lastPingAgo, queue }` с 503. Это **не конверт ошибки, а данные пробы**: мониторинг читает `alive` и код ответа. Сторож считает их, потому что видит литерал `status: 503`; соседний `:103` (`status: alive ? 200 : 503`) он не считает вовсе — вычисленный статус для него невидим.

Итого английских текстов 4 (3 × «Service unavailable», 1 × «Unauthorized»), и у них нет ни одного наблюдателя: `check:error-message-lang` знает пять именованных каналов. Тело ответа не читает никто: пингер воркера (`src/lib/queue/healthcheck-ping.ts:83`) смотрит только на факт ответа, внешний мониторинг (`DEPLOY-BACKLOG.md` I8) — на код и `alive`. Соседний `api/health/status/route.ts:51` уже отвечает через `fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED")`, то есть «роут для мониторинга — значит своя форма» в проекте не принято. В шапке сторожа (`error-envelope-bypass.test.ts:164`) написано «**7** конвертов» — фактически 6.

**`src/app/api/public/stats/route.ts:18` — 1 сайт, чистая привычка.** `new Response(JSON.stringify({ ok: false, error: { message } }))` руками повторяет форму `fail()` без `requestId`, `code` и репортинга 5xx. Вызывающих в `src/` у роута нет: главная и `/login` зовут `getPublicStats()` напрямую (`src/app/page.tsx:19`, `src/app/login/page.tsx:49`); роут в OpenAPI не описан (waiver `scripts/openapi-route-allowlist.txt:206`).

**`src/app/api/og/profile/route.tsx:71` и `:99` — 2 сайта, законные по форме.** Роут отдаёт картинку (`next/og`) для `og:image`; потребитель — краулеры соцсетей и мессенджеров, им JSON-конверт не нужен. Тексты английские («Missing username», «Provider not found»), но их не читает человек. Попутная находка: `generateMetadata` страницы `/u/[username]` (`src/app/(public)/u/[username]/page.tsx:207`) ставит ссылку на og-картинку **и для неопубликованного профиля** (`findProviderForMeta`, `:147`, не фильтрует `isPublished`), а роут картинки требует публикацию (`route.tsx:80`) — у таких страниц превью всегда ведёт на 404.

**Слепая форма детектора.** `ENVELOPE_FORMS` (`error-envelope-bypass.test.ts:171`) знает `NextResponse.json(`, `Response.json(`, `new Response(`, но не `new NextResponse(`. Сегодня все 8 таких вызовов в `src/` — успешные потоки и файлы со статусом 200/204, то есть инвентарь не изменится, но форма того же семейства (правило 4 GUARD-INTEGRITY).

## Что сделать

1. **`api/health/worker/route.ts`:**
   - `:30`, `:37`, `:50`, `:62` → `fail(…)` из `@/lib/api/response` с русскими текстами и кодами из реестра `ERROR_CODES`: 401 — «Требуется вход в аккаунт.» / `UNAUTHORIZED` (как в `health/status`); 503 без секрета — «Сервис временно недоступен.» / `SERVICE_UNAVAILABLE`; 503 при сбое Redis — тот же текст и код. `verifyWorkerSecret` возвращает `NextResponse | null` вместо `Response | null`.
   - `:75`, `:107` оставить как есть и **ратифицировать** в инвентаре: «данные пробы (`alive`, `lastPingAgo`, `queue`) с кодом 503 для мониторинга, а не сообщение об ошибке; тело не содержит текста». Не переписывать их так, чтобы детектор перестал их видеть (например, свести к `status: alive ? 200 : 503`) — это спрятало бы сайт, а не решило бы вопрос.
   - Почему `fail()`, а не ратификация английского: единообразие с `health/status`, `requestId` в ответе и запись 5xx в лог. `shouldReportFailure` (`src/lib/observability/noise.ts:57`) 503 в трекер не отправляет, поэтому шума в GlitchTip не будет.
2. **`api/public/stats/route.ts`** → `return fail(appError.message, appError.status, appError.code)`. Удалять роут в этой спеке не нужно (решение ниже).
3. **`api/og/profile/route.tsx`** — ратифицировать оба сайта в инвентаре («роут картинки для краулеров, тело `text/plain`, JSON-конверт потребителю бесполезен»), тексты перевести на русский («Не указан адрес профиля.», «Профиль не найден.») — чтобы в дереве не оставалось английских ответов. Картинку-заглушку не делать: у краулера 404 на `og:image` просто означает «без превью», а заглушка с 200 закэшировалась бы на сутки (`Cache-Control` `route.tsx` — `max-age=86400`) и пережила бы публикацию профиля.
4. **`/u/[username]/page.tsx` `generateMetadata`:** не отдавать `openGraph.images` и `twitter.images` для неопубликованного профиля (`provider.isPublished === false`) — ссылка на заведомо 404-картинку пропадает.
5. **Сторож `src/lib/api/error-envelope-bypass.test.ts`:**
   - строки инвентаря: `health/worker` → `count: 2`, причина «РАТИФИЦИРОВАНО (ENVELOPE-BYPASS-TRIAGE-02): данные пробы…»; `og/profile` → «РАТИФИЦИРОВАНО…»; строку `public/stats` удалить;
   - добавить в `ENVELOPE_FORMS` форму `new NextResponse(` и строку в фикстуру контроля машинерии (положительную — `new NextResponse(JSON.stringify({ ok: false }), { status: 500 })`, отрицательную — со `status: 200`);
   - в шапке назвать слепую форму: вычисленный статус (`status: cond ? 200 : 503`) и конверт, собранный в другой функции и возвращённый переменной, не считаются; исправить «7» на фактическое число;
   - добавить блок `@probe` с пробой на новой форме (см. «Проверка»).
6. `docs/QUALITY-GATES.md` § `check:error-message-lang`: абзац про инвентарь — перечислить четыре формы и назвать ратифицированные обходы (прокси, данные пробы воркера, картинка og).

## Решения владельца

Не нужны. Удаление неиспользуемого `/api/public/stats` — отдельное решение, в эту спеку не входит: роут публичный, и внешний потребитель (лендинг, партнёр) из кода не виден. Если владелец подтвердит, что внешних потребителей нет, — удалить роут вместе со строкой waiver'а (структурный триггер: число API-роутов в контексте).

## Готово, когда

- В `src/` нет английских текстов в ответах ошибок сервера: `grep -rn '"Service unavailable"\|"Unauthorized"\|"Missing username"\|"Provider not found"' src/app` пуст.
- Инвентарь сторожа: `src/proxy.ts` 3, `health/worker` 2, `og/profile` 2 — у всех трёх причина начинается с «РАТИФИЦИРОВАНО»; строк «НЕ РАЗОБРАН» нет.
- Детектор видит четыре формы; контроль машинерии покрывает все четыре.
- Страница неопубликованного профиля не ссылается на og-картинку.

## Проверка

- `npx vitest run src/lib/api/error-envelope-bypass.test.ts`, тесты `src/app/api/health/*`, `src/lib/queue/worker-healthcheck-timeout.test.ts`.
- Проба (GUARD-INTEGRITY, правдоподобная форма, а не минимальная): в `src/app/api/health/route.ts` дописать `return new NextResponse(JSON.stringify({ ok: false, error: { message: "x" } }), { status: 503 });` — до правки сторож зелёный, после — красный с именем файла. Вторая проба по одной оси: вернуть в `health/worker` одну строку `Response.json({ error: "Unauthorized" }, { status: 401 })` — красный «число обходов в файле изменилось: заморожено 2, найдено 3». Восстановить побайтно, записать в `@probe`.
- Живая: `curl -i -X POST http://localhost:3000/api/health/worker` без заголовка → 401 и русский конверт с `requestId`; с верным `x-worker-secret` → 200; `GET` с секретом при живом воркере → 200 `alive: true`. `/u/<скрытый профиль>` — в HTML нет `og:image`.
- Гейты: `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake && npm run check:error-message-lang`.

## Документы

- BACKLOG: удалить `ENVELOPE-BYPASS-TRIAGE-02`.
- BACKLOG-DONE: строка «ENVELOPE-BYPASS-TRIAGE-02 — 9 сайтов разобраны: 5 сведены к `fail()`, 4 ратифицированы (данные пробы воркера, картинка og); детектор видит `new NextResponse(`».
- `docs/QUALITY-GATES.md` — шаг 6.
- Контекст — не трогать: роуты, env и схема не меняются.

## Риски

- `fail()` на 5xx пишет `logError` и увеличивает счётчик частоты 5xx (`src/lib/monitoring/api-alerts.ts:23`, порог 5 в минуту). Пинг воркера при лежащем Redis даёт 2 в минуту — сам по себе порог не пересекает, но добавляется к остальным 5xx того же сбоя. Это честно: Redis действительно лежит.
- Внешний монитор, настроенный на текст `"Service unavailable"` в теле, перестанет совпадать. Процедуры в `DEPLOY-BACKLOG.md` и runbook'ах опираются на код и `alive`, а не на текст — проверено грепом.
