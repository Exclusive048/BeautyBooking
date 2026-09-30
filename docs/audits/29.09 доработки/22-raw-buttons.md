# 22 · Сырые `<button>` и поля → общие компоненты

**Источник:** `UI-26` (`docs/audits/AUDIT-FRESH-05-ui.md` § C и P3; план — `AUDIT-CAMPAIGN-BLOCKED.md` § UI-26, `docs/audits/AUDIT-CAMPAIGN-02.md` п. 8) · **Тип:** рефакторинг · **Объём:** L
**Зависит от:** 23 (вести парой: файлы пересекаются, одна приёмка на область), 29 (высота иконочных кнопок), 12 (если `tailwind-merge` придёт раньше, часть ловушек плоского `cn` снимается, таблица замен не меняется)

## Что не так
Замер 2026-09-29: файлы `.tsx`, без тестов, комментарии вырезаны. Сами примитивы `src/components/ui/*` в счёт не входят.

- **173 сырых `<button>` в 112 файлах.** В августе было 196 в 125 файлах; область `src/components` уже доведена до нуля (AUDIT-CAMPAIGN-02 п. 8, шаг 2). Плюс 1 `<motion.button>` (`home/components/stories-rail.tsx:52`) — та же сырая кнопка, записанная иначе.
  По областям: master 49 кнопок / 32 файла · studio 37/25 · public (booking, home, media, model-offers, public-profile, public-studio, reviews) 31/14 · client 15/10 · admin 12/12 · общее кабинетов (chat, cabinet, billing, notifications) 12/9 · catalog 9/5 · прочее (login, cities, faq, global-error) 8/5.
- **151 из 173 кнопок не задают стиль фокуса.** Клавиатурный фокус держится на системном контуре, который в каждом браузере свой. У `Button` вместо него — фирменное кольцо.
- **Поля — 40:** `<input>` 29 в 27 файлах, `<select>` 9 в 8, `<textarea>` 2 в 2.
  - Законно остаются сырыми 16: 11 скрытых `type="file"`, 4 `type="range"`, honeypot `partners/components/partnership-form.tsx:128`.
  - Переводить 24.
- Примеры:
  - `studio-cabinet/schedule/components/schedule-header.tsx:175,188,204,212,219` — пять сырых кнопок в одной шапке. Переключатель «день/неделя» сделан своими классами, хотя есть `SegmentedTabs`.
  - `master/components/dashboard/booking-row-actions.tsx:147,160,173` — иконочные кнопки с `disabled` и `title`, в котором объяснено, почему кнопка выключена.
  - `master/components/clients/sort-select.tsx:40` и `master/components/notifications/sort-select.tsx:40` — два почти одинаковых файла с сырым `<select>`.
  - `client-cabinet/bookings/client-review-modal.tsx:79`, `client-cabinet/reviews/edit-review-modal.tsx:91`, `reviews/components/review-form.tsx:40` — три копии выбора звёзд.
  - `master/components/schedule-settings/components/chip-group.tsx:30` — `ChipGroup` описан в дизайн-скилле (§16) как общий паттерн, но лежит в `features/master`. Его уже импортирует и студия (`studio-cabinet/schedule-team/components/team-rhythm-modal.tsx`).
  - `master/components/services/row-menu.tsx:102` — бэкдроп меню `fixed inset-0`. Этот сайт законный.

## Что сделать
**Таблица замен.** Классы сайтов выделены эвристикой; на каждом этапе сайт классифицируется заново. Правило выбора варианта — из дизайн-скилла § «Выбор варианта `Button`»: если вызывающий задаёт свою заливку или цвет — только `wrapper`.

| Класс сайта (≈ число) | Замена |
|---|---|
| Бэкдроп или невидимая зона нажатия (6): `row-menu.tsx:102`, `home/components/stories-viewer-overlay.tsx:403,409`, `master/components/schedule/empty-cells-overlay.tsx:86`, `studio-cabinet/schedule/components/day-view/day-grid.tsx:195`, `app/global-error.tsx:102` (рендерится без корневого layout) | Остаются сырыми, ратифицируются маркером на каждом сайте (решение 1) |
| Выбор одного из N — вкладки, фильтры, «день/неделя», период (≈25; студия 11, клиент 6, админка 4, центр уведомлений) | `SegmentedTabs` для 2–3 вариантов, `Tabs` для вкладок со счётчиком (`badge`) |
| Чипы — выбор и быстрые вставки (≈10: `master/components/portfolio/modals/edit-item-modal.tsx:241`, `reject-application-modal.tsx:97`, `chat/composer/quick-replies.tsx:25`, `review-reply-form.tsx:95`…) | `ChipButton active` |
| Выбираемая строка или карточка списка (≈15: `client-list-item.tsx:49`, `master-list-item.tsx:51`, `service-list-item.tsx:36`, `settings-nav.tsx:56`, `conversation-row.tsx:36`, `mode-card.tsx:21`…) | `Button variant="wrapper"` + `aria-pressed` или `aria-current` |
| Иконочная кнопка (51) | От `h-9` и выше — `ghost` или `icon` с `size="icon"`. Меньше (`h-6`…`h-8`, плотные строки) — `wrapper` с прежним размером, пока спека 29 не решила вопрос высоты |
| Текстовая кнопка-ссылка — «Назад», «Отправить код ещё раз» (19) | `wrapper` с прежними текстовыми классами |
| Пункт меню или подсказки (6: `role="menuitem"`, `onMouseDown preventDefault`) | `wrapper`, обработчики сохранить |
| Ячейка даты или слота (8: `booking-flow/components/date-grid.tsx:217`, `time-grid.tsx:193`, `when-step.tsx:162,263`, `studio-package-flow.tsx:475,498`, `client-reschedule-modal.tsx:202`, `propose-time-modal.tsx:143`) | `wrapper`. Если после миграции видно не меньше трёх одинаковых — общий `SlotButton` в `components/ui` |
| Звёзды (3 копии) и режим чтения inline-edit (5: `profile/editable/*`) | Общие `StarRatingInput` и `InlineEditField` в `components/ui` |
| Главное действие (`public-profile/master/mobile-booking-cta.tsx:29`, «Показать ещё» `clients-pagination.tsx:30`, `reviews-pagination.tsx:25`) | `primary` / `secondary` |

**Поля**

| Сайты | Замена |
|---|---|
| 11 скрытых file-input, 4 range, honeypot | Ратифицировать маркером |
| 2 видимых file-input: `booking-flow/phases/form-phase.tsx:227`, `public-studio/studio-booking-flow/booking-flow.tsx:818` | Скрытый input + кнопка-триггер `Button variant="secondary"`, как в `master/components/portfolio/modals/upload-modal.tsx:392` |
| `public-studio/.../steps/you-step.tsx:147` — чекбокс с `sr-only` | `Switch` |
| `booking-flow/components/phone-input.tsx:36`, поиск и текст: `bookings-toolbar.tsx:69`, `service-search-input.tsx:174`, `chat/conversation-list/list-header.tsx:45`, `studio-profile-form.tsx:233` | `Input`. Ширина уже уступает вызывающему; `pl-*` под иконку побеждает `px-4` — это проверено по бандлу, см. скилл |
| 5 полей `profile/editable/*` и `editable-textarea-row.tsx:142`, `portfolio/modals/tag-input.tsx:102` | `InlineEditInput` / `InlineEditTextarea` — подчёркивание, §7 скилла, в `components/ui` |
| `chat/composer/composer.tsx:297` | `Textarea` (он уже пробрасывает `ref`) |
| 7 `<select>` в формах модалок мастера и `admin-cabinet/billing/components/plan-edit-dialog.tsx:282` | `Select` |
| 2 одинаковых `sort-select.tsx` | Один компонент поверх `Select`. В `Select` добавить вариант без рамки |

`Input` и `Select` должны принимать `ref` — тип `React.ComponentProps<"input" | "select">`. Inline-edit и поиск его передают.

**Этапы.** Каждый выкатывается отдельно, в каждом числа в стороже уменьшаются тем же изменением. Порядок — из AUDIT-CAMPAIGN-02 п. 8.
0. Сторож и примитивы, без видимых изменений:
   - перенести `ChipGroup` и `ModeCard` в `src/components/ui/`;
   - сделать `InlineEditField` / `InlineEditInput` / `InlineEditTextarea` и `StarRatingInput`;
   - добавить в `Select` вариант без рамки и приём `ref`.
1. Кабинет клиента: 15 кнопок / 10 файлов.
2. Админка: 12/12 и 1 select.
3. Каталог (9/5 и 4 поля), общее кабинетов (12/9 и 4 поля), прочее (login, cities, faq — 7).
4. Публичные страницы и запись: 31/14, 7 полей, `motion.button`.
5. Кабинет студии: 37/25 и 2 поля.
6. Кабинет мастера: 49/32 и 16 полей.

**Сторож** — `src/components/ui/raw-controls-inventory.test.ts`. Он работает по правилу GUARD-INTEGRITY 2: полноту не вывести, поэтому инвентарь заморожен и сторож падает на дельте.
- Обходит `src/**/*.tsx`, кроме `src/components/ui/` и тестов. Комментарии убирает через `stripComments` из `src/lib/testing/source-scan.ts` (правило 6).
- Считает открывающие теги `<button`, `<input`, `<select`, `<textarea`, а также любую форму `<X.button` / `<X.input` (`motion.`, `m.`).
- Инвентарь `FROZEN: Record<файл, {button, input, select, textarea}>`. Сторож краснеет, когда:
  - появился новый файл;
  - число выросло;
  - число упало — с текстом «обновите FROZEN: было N, стало M», чтобы ремедиация фиксировалась в стороже;
  - файл пропал.
- Ратификация — на каждом сайте: маркер `raw-control-ok: <причина>` в строке прямо над тегом, читается из сырого текста. Помеченный сайт в счёт не идёт. Маркер без сырого тега под ним или с пустой причиной — красный.
- Контроль машинерии на фиксированной фикстуре, не на размере находок (правило 2, уточнение FIX-B15):
  - должны считаться: `<button`, `<motion.button`, многострочный `<button\n type=…`, тег внутри тернарника;
  - не должны считаться: `<Button`, `"<button>"` внутри строки, тег в комментарии.
- Проба (`@probe`), по одной оси за раз (правило 9):
  1. Вставить `<button type="button" onClick={f}>x</button>` в `features/master/components/services/service-row.tsx`. Ожидается красный с именем файла и «button 1 → 2».
  2. Та же вставка в той же строке, но формой `<motion.button …>`. Ожидается красный.
  3. Маркер над `<Button`. Ожидается «маркер без сырого тега».
  4. Одна кнопка переведена на `Button`, `FROZEN` не обновлён. Ожидается красный на уменьшении.

  В `@probe` записать наблюдавшиеся тексты падений.
- В шапке сторожа назвать формы, которых он не видит:
  - `React.createElement("button")`;
  - `role="button"` на `div` — это a11y-дефект другого класса;
  - сторонние компоненты, рендерящие `<button>`.

## Решения владельца
1. **Какие сайты остаются сырыми законно.** Бэкдропы и невидимые зоны нажатия (5), `global-error` (1), скрытые file-input (11), range (4), honeypot (1). Бэкдропы как законный класс называл ещё AUDIT-CAMPAIGN-02 п. 8. Рекомендация — утвердить.
2. **Как выглядят фильтры и вкладки.**
   - (а) Перевести механически на `wrapper`: в каждой области вид сохраняется.
   - (б) Свести к `Tabs` / `SegmentedTabs` / `ChipButton`: один вид во всех кабинетах, видимо меняется около 35 сайтов.

   Рекомендация — (б): находка заведена именно ради одинакового вида. Приёмка по скриншотам.
3. **Радиус выпадающих списков.** Семь `<select>` в модалках мастера сейчас `rounded-xl` (12px), а у `Select` — `rounded-2xl` (16px). Рекомендация — принять вид примитива.

## Готово, когда
- `FROZEN` пуст. Сырые теги остались только с маркером, их 22: 6 кнопок и 16 полей.
- `ChipGroup`, `ModeCard`, `InlineEdit*`, `StarRatingInput` лежат в `src/components/ui/`, таблица §6 скилла совпадает с кодом.
- Фокус с клавиатуры на любой кнопке этапа показывает фирменное кольцо.
- У выключенных кнопок с подсказкой подсказка видна.

## Проверка
- `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake`, затем `npm run check:dead-classes`, `npm run check:ui-text`, `npm run test`. Кроме нового сторожа должны быть зелёными `button-wrapper-chromeless.test.ts`, `focus-indicator.test.ts`, `form-control-label.test.ts`, `class-groups.test.ts`.
- **Конфликты классов проверять сборкой, не на глаз.** Если в `className` при замене есть группы, которые задаёт и база `Button` (`transition-*`, `disabled:opacity-*`, `rounded-*`, `gap-*`, `h-*` / `w-*`), сравнить номера строк в бандле: `node node_modules/tailwindcss/lib/cli.js -c tailwind.config.js -i src/app/globals.css -o out.css`.
- **Живая проверка** — `.qa`-спека области по образцу `.qa/diagnostics/ui-26-27-components/area.spec.ts`.
  - Экраны выбирать от файлов этапа: по импортам найти роут, роль взять из сида (§16 контекста).
  - Размеры 375×812 и 1280×800, обе темы, скриншоты до (через stash) и после.
  - Где вид меняться не должен — сравнивать байт-в-байт. Где меняется (решение 2) — смотреть глазами.
  - Рантайм-ассерты:
    - Tab по экрану: у фокусной кнопки в computed `box-shadow` есть кольцо;
    - у выключенной кнопки с `title` подсказка появляется при наведении;
    - подсказки адреса и тегов выбираются кликом.

## Документы
- `AUDIT-CAMPAIGN-BLOCKED.md` § UI-26 — пометить закрытым со ссылкой на спеку.
- `AUDIT-CAMPAIGN-PROGRESS.md`: UI-26 → FIXED.
- `AUDIT-CAMPAIGN-02-PROGRESS.md` п. 8 — отметить закрытые области.
- `BACKLOG-DONE.md` — строка.
- Дизайн-скилл, в том же изменении, что примитивы:
  - §6 — таблица компонентов: `ChipGroup`, `ModeCard`, `InlineEdit*`, `StarRatingInput`, вариант `Select`;
  - §6 — правило «сырой тег допустим только с маркером `raw-control-ok`»;
  - §16 — новые пути перенесённых компонентов.
- `.qa/TESTIDS.md` — если переезжают `data-testid`.
- Контекст — триггера нет, не трогать.

## Риски
- **Пропадают подсказки у выключенных кнопок.** `Button` при `disabled` ставит `pointer-events-none`, и `title` у выключенной кнопки перестаёт показываться: `booking-row-actions.tsx:147,173`, `client-detail-header.tsx:177`, `studio-cabinet/reviews/components/review-card.tsx:72`. Для таких сайтов — `aria-disabled` с пустым обработчиком или подсказка на обёртке.
- **`ghost` и `icon` перебивают заливку вызывающего** — `cn` плоский, при своей заливке нужен только `wrapper`. Базовые `transition-all duration-300` и `disabled:opacity-50` сталкиваются с `transition-colors` / `disabled:opacity-40` вызывающего — проверять по бандлу.
- **`size="icon"` в плотных строках.** Это 40px плюс невидимая зона до 44px: в админ-таблицах с `h-7` изменится высота строки. Поэтому до спеки 29 такие сайты — `wrapper`.
- **`onMouseDown preventDefault` в подсказках** (`tag-input.tsx:126`, `address-editor.tsx:215`). Если его потерять, blur закроет список раньше клика.
- **Локаторы `.qa` на `SegmentedTabs`.** Он рендерит `role="tab"`, и локаторы `getByRole("button")` на таких экранах перестанут находить элементы. Прогнать затронутые спеки.
