# 23 · `dark:`-оверрайды → токены

**Источник:** `UI-27` (`docs/audits/AUDIT-FRESH-05-ui.md` § D и P3; план — `AUDIT-CAMPAIGN-BLOCKED.md` § UI-27, `docs/audits/AUDIT-CAMPAIGN-02.md` п. 8) · **Тип:** рефакторинг + дефект контраста · **Объём:** L
**Зависит от:** 22 (идти парой: те же области, та же приёмка), 12 (желательно раньше — `cn` без слияния классов усложняет замену)

## Что не так
Замер 2026-09-29. Файлы `.ts/.tsx` в `src`, без тестов, комментарии вырезаны.

**Сколько `dark:` и где.** 524 утилиты `dark:` в 173 файлах; в августе было 548 в 188. `src/components` уже 0 (AUDIT-CAMPAIGN-02 п. 8, шаг 2).

| Область | Утилит / файлов |
|---|---|
| master | 180 / 47 |
| studio | 137 / 35 |
| admin | 86 / 45 |
| public | 47 / 18 |
| общее кабинетов (billing, chat, crm, cabinet, notifications) | 30 / 12 |
| прочее (login, support, partners, legal, careers, help, pricing) | 27 / 10 |
| client | 16 / 5 |
| catalog | 1 / 1 |

**Почти всё — тёмная половина статусной пары из палитры Tailwind.** 504 из 524: red 136 · emerald 119 · amber 104 · rose 100 · blue 24 · slate 13 · purple 5 · orange 2 · pink 1. Чаще всего: `dark:text-emerald-300` ×54, `dark:text-red-300` ×44, `dark:text-rose-300` ×40, `dark:text-red-400` ×30, `dark:bg-red-950/40` ×25. Переводить нужно всю пару: светлая половина — 811 утилит палитры в 216 файлах, и счётчик `dark:` её не видит.

**Токены уже есть** (шаг 1 п. 8, `90c543d4`): `bg-/text-/border-{success,warning,danger,info}-{surface,text,border}` — `src/app/globals.css:148-159` (светлая), `:268-279` (тёмная), мост `tailwind.config.js:102-113`. Используют 44 файла; `Badge` уже переведён и служит эталоном.

**28 мест в 16 файлах: тёмный статусный текст без тёмного близнеца** (`text-red-600` и т. п. без `dark:text-*`). В тёмной теме это мелкий красный на тёмно-бордовом; счётчик `dark:` их не видит по построению. Примеры: `public-studio/components/studio-package-flow.tsx:492,518,571,629` · `public-profile/master/components/package-booking-flow.tsx:479,535,617` · `master/components/schedule/reschedule-modal.tsx:470` · `reviews/components/review-form.tsx:209` · `media/components/avatar-editor.tsx:307`.

**Словари статусов закрывают десятки сайтов разом** — файлы, где статус превращается в набор классов:
- мастер: `master/components/notifications/lib/card-config.ts` (14), `master/components/clients/lib/format.ts` (12), `master/components/model-offers/lib/format.ts` (12);
- студия: `studio-cabinet/masters/lib/status-display.ts`, `studio-cabinet/schedule/lib/booking-status-display.ts`, `studio-cabinet/bookings/lib/source-display.ts`, `studio-cabinet/clients/components/client-segment-badge.tsx`.

**rose служит цветом ошибки**, хотя токен ошибки — danger (красный): `booking-flow/phases/form-phase.tsx:295` · `chat/composer/composer.tsx:326,331` · `client-cabinet/bookings/client-reschedule-modal.tsx:221` · `master/components/account/account/danger-zone-card.tsx:78-95` · `master/components/bookings/booking-manage-actions.tsx:119`.

**Остаток — не статусы.**
- 20 утилит `dark:` без палитры:
  - `app/careers/page.tsx:21,25`, `app/help/page.tsx:41,45` — декоративные подложки `dark:bg-primary/[0.12]` ×7 и `dark:bg-primary-magenta/[0.12]` ×7;
  - `app/login/login-client.tsx:458`, `app/login/login-unavailable.tsx:36` — `dark:text-text-main`;
  - `cabinet/components/share-profile-section.tsx:158` — `dark:bg-white`, подложка QR-кода, законно.
- Палитра, которая несёт данные, а не статус:
  - теплокарта `master/components/analytics/lib/format.ts:67-72` — шкала rose 100…700;
  - цвета аватаров по категориям: `clients/lib/format.ts:99-103`, `model-offers/lib/format.ts:81-85`;
  - оранжевый «горящего окошка»: `home/components/hot-slots-preview.tsx:170`, `booking-flow/components/service-header.tsx:45`.

## Что сделать
**Таблица замен**

| Сейчас | Станет |
|---|---|
| `bg-emerald-50 … dark:bg-emerald-950/40`, `text-emerald-600/700 dark:text-emerald-300/400`, `border-emerald-200 dark:border-emerald-800/50` | `bg-success-surface`, `text-success-text`, `border-success-border` |
| то же для amber / red / blue | `warning-*` / `danger-*` / `info-*` |
| Плашка целиком: рамка + заливка + текст в `rounded-full px-*` | `<Badge variant="success\|warning\|danger\|info\|muted">` |
| Текст ошибки в форме (`text-red-600`, `text-rose-600 dark:text-rose-300`) | `text-danger-text` |
| slate («отменено», «приглушено») | `Badge variant="muted"`; `bg-muted`, `text-muted-foreground` |
| Сплошные точки и иконки (`bg-emerald-500`, `bg-red-500/10`) — видны в обеих темах, но это палитра | `bg-success` / `bg-destructive` / `bg-warning` с `/<alpha>` — у этих мостов есть `<alpha-value>` |
| `dark:` поверх своего токена (careers/help, login) | Новый токен, если встречается хотя бы дважды; иначе ратифицировать |
| Теплокарта, аватары, оранжевый, purple | По решению 3 |

⚠️ К `*-surface / -text / -border` модификатор прозрачности не применяется: альфа тёмной темы уже зашита в переменную, поэтому `bg-success-surface/50` не сгенерируется вовсе. На этапе 0 пробой убедиться, что `check:dead-classes` такой класс ловит.

**Этапы.** Каждый выкатывается отдельно. Порядок областей — как в спеке 22, чтобы на один экран приходилась одна приёмка. Внутри области сначала словари статусов, потом разметка.
0. Сторож (ниже). Токены по решению 3, если понадобятся: обе темы в `globals.css`, мост, строка в `src/app/tailwind-bridge.test.ts`.
1. Кабинет клиента — 16 / 5, из них 9 в `client-profile-page.tsx`.
2. Админка — 86 / 45.
3. Общее кабинетов, прочее и каталог — 58 / 23, в том числе `billing/components/billing-page.tsx` (7).
4. Публичные страницы и запись — 47 / 18. Сюда же почти все 28 мест без тёмного близнеца.
5. Кабинет студии — 137 / 35, начать с четырёх словарей статусов.
6. Кабинет мастера — 180 / 47, начать с `card-config.ts`, `clients/lib/format.ts`, `model-offers/lib/format.ts`, `analytics/lib/format.ts`.

**Сторож** — `src/lib/ui/dark-override-inventory.test.ts`. Полноту не вывести, поэтому инвентарь заморожен и сторож падает на изменении числа (GUARD-INTEGRITY, правило 2).
- Два счётчика на файл, только по строковым литералам; комментарии вырезаются `stripComments` из `src/lib/testing/source-scan.ts`:
  - `dark` — вариант `dark:` в любой позиции (`hover:dark:`, `dark:hover:`) и обходные формы `[.dark_&]:`, `[.dark &]:`, `group-[.dark]:`, `data-[theme=dark]:`;
  - `palette` — `(bg|text|border|ring|fill|stroke|from|via|to|divide|outline)-(emerald|green|lime|teal|amber|yellow|orange|red|rose|pink|blue|sky|indigo|violet|purple|fuchsia|slate|zinc|gray|neutral|stone)-\d{2,3}`.
- `FROZEN: Record<файл, {dark, palette}>`. Сторож краснеет на новом файле, на росте числа и на его снижении — в последнем случае просит обновить `FROZEN`.
- Ратификация — на каждом сайте: маркер `dark-ok: <причина>` в строке над классом (подложка QR, шкала теплокарты, аватары). Маркер, под которым нет палитры или `dark:`, — красный.
- Контроль машинерии — на фиксированной фикстуре:
  - считаются: `"dark:text-red-300"`, `` `${x} dark:bg-emerald-950/40` ``, `"[.dark_&]:text-red-300"`, `"hover:dark:bg-rose-950/30"`, одиночный `"text-red-600"`;
  - не считаются: `// dark:` в комментарии, `bg-success-surface`, ключ `darkMode`, строка темы `"dark"`.
- `@probe` — в `features/reviews/components/review-form.tsx:209`, по одной оси на пробу:
  1. добавить `dark:text-red-300` → красный, файл назван;
  2. то же в форме `[.dark_&]:text-red-300` → красный;
  3. добавить одиночный `text-red-600` без близнеца → красный по `palette`: одиночный светлый класс учитывается;
  4. перевести пару на `text-danger-text`, не обновив `FROZEN` → красный на снижении.
- В шапке сторожа назвать, чего он не видит:
  - класс, собранный из частей (`` `text-${tone}-600` ``);
  - цвет, заданный инлайн через `style` (отдельный запрет, скилл §2);
  - блоки `.dark {}` в `globals.css` — они законны и сторожем не читаются.

## Решения владельца
1. **rose как цвет ошибки.** (а) Перевести в danger — все ошибки и «опасная зона» станут одного красного; (б) оставить rose. **Рекомендация — (а).** ⚠️ По таблице скилла §16 rose ещё и тон «сегодня / в процессе» — такие сайты не трогать, решить отдельно.
2. **Сдвиг оттенков при переходе на токены.** Например, `text-emerald-600` → `success-text`: в светлой теме это emerald-700, на полтона темнее; `dark:text-red-400` → red-300. (а) Принять значения токенов — их контраст проверен на `Badge`; (б) завести вторую ступень `-strong`. **Рекомендация — (а)**, вторую ступень — только если наберутся хотя бы два повтора.
3. **Палитра, которая не про статус:** теплокарта аналитики, аватары, оранжевый «горящего окошка», purple. (а) Ратифицировать как данные и категории; (б) завести категориальные токены `--chart-*`, `--avatar-*`, `--hot`. **Рекомендация — (а) сейчас; для «горящего окошка» — (б)**: это продуктовый акцент.

## Готово, когда
- Вне ратифицированных сайтов `dark:` = 0 и статусная палитра = 0; `FROZEN` пуст.
- В ратифицированном списке не больше ~20 сайтов, у каждого причина: теплокарта, аватары, QR, декор (если для него не заведён токен).
- 28 мест без тёмного близнеца переведены.
- Дизайн-скилл говорит: «`dark:` в разметке — сигнал недостающего токена», и перечисляет ратифицированный список.

## Проверка
- `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake`.
- `npm run check:dead-classes` — должен ловить классы вида `bg-success-surface/50`, которые не генерируются.
- `npm run check:ui-text`.
- `npm run test`: новый сторож, `tailwind-bridge.test.ts`, `globals-contrast.test.ts`, `lib/ui/brand-colors.test.ts`, `class-groups.test.ts`.
- Порядок классов: токенный цвет и `text-text-sec` вызывающего в одном `className` — проверять по номерам строк в собранном CSS (скилл, § «Выбор варианта»).
- **Живая проверка** — на каждом этапе обе темы, экраны 375 и 1280.
  - Экраны выбирать по словарям статусов этапа:
    - студия — журнал записей со всеми статусами, клиенты с сегментами, мастера со статусами, уведомления;
    - мастер — главная, клиенты, уведомления, аналитика, модель-офферы;
    - публичные — пакетная запись, запись в студию, отзыв.
  - Состояния ошибок вызывать руками: пустая отправка формы, заведомо занятое окошко.
  - Скриншоты до (через stash) и после. Где значение токена совпадает с прежней парой (прецедент — `Badge`), сравнивать байт-в-байт; где оттенок сдвинулся — глазами.
  - Контраст мелкого текста в тёмной теме — рантайм-ассертом: computed color против фона, не меньше 4.5:1.

## Документы
- `AUDIT-CAMPAIGN-BLOCKED.md` § UI-27 — закрыть; `AUDIT-CAMPAIGN-PROGRESS.md` UI-27 → FIXED; `AUDIT-CAMPAIGN-02-PROGRESS.md` п. 8 — отметить области.
- `BACKLOG-DONE.md` — строка; отдельно упомянуть 28 мест без тёмного близнеца.
- Дизайн-скилл:
  - §3 — `dark:`-вилки в разметке запрещены вообще, а не только на статусах; ратифицированный список;
  - §16 — в таблице тонов статусов токены вместо amber / emerald / rose / slate; «`rose`/`slate` допустимы» сузить до ратифицированного.
- Контекст — триггера нет. Если заводятся новые токены — поправить только §2 («токен живёт в двух местах»).

## Риски
- **Альфа тёмной темы зашита в токен** (`…-950/0.4`). Где раньше было `/30` или `/20`, фон станет плотнее — проверять глазами.
- **rose значит разное.** Механическая замена rose → danger заденет rose «сегодня» и шкалу теплокарты. Разбирать по сайту, не по слову.
- **Ступень наведения** (`hover:` / `dark:hover:`) у кнопок «опасной зоны» (`danger-zone-card.tsx:95`, `booking-manage-actions.tsx:119`) заменить на `Button` с токеном, а не удалить вместе с парой.
- **Пересечение со спекой 22.** Одни и те же файлы правятся обеими спеками — делать обе за один проход по области, иначе будут конфликты правок.
