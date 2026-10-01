---
name: ui-ux-pro-max
description: Главный авторитет по дизайну и UI для МастерРядом. Используй ВСЕГДА при любой работе с интерфейсом — страницы, компоненты, стили, формы, кабинеты, лендинги, навигация, карточки, модалки, темы, анимации, иконки, типографика. Триггеры — дизайн, верстка, страница, компонент, UI, UX, кнопка, форма, поле, карточка, модалка, навбар, футер, сайдбар, светлая тема, тёмная тема, redesign, переделать, сделать красиво, лендинг, кабинет, стилизовать, оформить, иконка, шрифт, цвет, отступ, анимация, переход, hover.
---

# UI/UX Pro Max — единый источник правды по дизайну МастерРядом

Это **главный** и единственный скилл по дизайну. Если что-то противоречит ему — побеждает он. Если в `MASTERRYADOM_AI_CONTEXT.md` сказано иначе — побеждает этот скилл (контекст описывает _что есть_, скилл задаёт _как должно быть_).

---

## 0. Что прочитать перед началом

1. `docs/design-system/МастерРядом - Design System.html` — **визуальный референс**. Открыть в браузере при сомнениях по цвету, типографике, состояниям компонентов.
2. `src/app/globals.css` — **источник палитры**. Все цвета — отсюда.
3. `src/lib/ui/text.ts` — **источник текстов**: барель над доменами `src/lib/ui/text/<домен>.ts`. Все строки — оттуда; импорт `import * as UI_TEXT from "@/lib/ui/text"`.
4. `src/components/ui/` — **источник компонентов**. Никогда не делать локальные кнопки/инпуты, использовать готовые.

Если этих файлов нет или они устарели — это первая задача, до любых правок страниц.

---

## 1. Стиль и тон

**Эстетика:** редакторская, премиальная, тихая. Бордовый бархат, кремовая бумага, курсивный Playfair Display. Ориентиры: Cal.com, Linear.app, бренд-страницы Hermès. **НЕ** Material Design, **НЕ** Bootstrap, **НЕ** generic-AI-фиолетовый.

**Голос:** уважительный, краткий. Глаголы в начале CTA. Никаких восклицательных знаков. Пользователь — взрослый человек.

---

## 2. Палитра — централизована, не хардкодится

Палитра живёт **в одном файле** — `src/app/globals.css` через CSS-переменные. В компонентах используются только семантические токены через Tailwind. Перекраска бренда = правка одного файла.

```ts
// tailwind.config.ts — мост между CSS-переменными и классами
colors: {
  background: "rgb(var(--bg) / <alpha-value>)",
  foreground: "rgb(var(--fg) / <alpha-value>)",
  primary: { DEFAULT: "rgb(var(--primary) / <alpha-value>)", foreground: "rgb(var(--primary-fg) / <alpha-value>)" },
  accent:  { DEFAULT: "rgb(var(--accent) / <alpha-value>)", foreground: "rgb(var(--accent-fg) / <alpha-value>)" },
  muted:   { DEFAULT: "rgb(var(--muted) / <alpha-value>)", foreground: "rgb(var(--fg-muted) / <alpha-value>)" },
  border:  "rgb(var(--border) / <alpha-value>)",
  // ...
}
```

**Бренд-токены (для бренд-градиентов, hero, CTA-акцентов):**
- `--brand-from: 114 8 8` (#720808 deep burgundy)
- `--brand-via: 161 7 40` (#A10728 raspberry)
- `--brand-deep: 86 5 5` (#560505 deepest)
- Утилита: `bg-brand-gradient` → `linear-gradient(135deg, var(--brand-from), var(--brand-via) 55%, var(--brand-deep))`

**Семантические токены проекта (используем их, НЕ shadcn-имена):**
- Поверхности: `bg-page`, `bg-card`, `bg-input`, `bg-muted`, `bg-surface`
- Текст: `text-main`, `text-label`, `text-sec`, `text-placeholder`
- Границы: `border-subtle`, `border-focus`, `ring`
- Акценты: `bg-primary` (бордовый #720808), `text-primary`, `border-primary`
- Состояния: `bg-success`, `bg-warning`, `bg-destructive`

> ⚠️ В этом проекте используется **кастомная** система имён (`bg-page`, `text-main`, `text-sec`, `border-subtle`), не стандартный shadcn. Проверь `tailwind.config.js` перед использованием. Не выдумывай токены, которых нет.

**Запрещено:**
- `bg-[#fff]`, `text-[#720808]`, `style={{ color: "..." }}`
- Tailwind-цвета напрямую: `bg-violet-600`, `text-zinc-900`, `bg-amber-500`
- `rgb(...)`, `hsl(...)` в JSX

Если для нового UI нужен цвет, которого нет в токенах — **сначала добавить токен в `globals.css`**, потом использовать.

### ⚠️ Перед редизайном страницы — проверка миграции палитры

Бывает, что бренд-токены добавлены (`--brand-from`), но **семантические** (`--primary`, `--accent`, `--bg-page`) остались от прошлой палитры. В этом случае компоненты через `bg-primary` получают старый цвет, а только бренд-градиенты — новый.

**Чек:** открой `src/app/globals.css`, проверь значения `--primary`, `--bg-page`, `--text-main` в `:root` и `.dark`. Если не соответствуют дизайн-системе (бордовый primary, кремовый bg-page в светлой, глубокий бордовый в тёмной) — **миграция палитры первая, до правки страниц**.

Без этого редизайн страниц приведёт к смешанной палитре: новые градиенты + старые кнопки/фокусы.

---

## 3. Темы — обе всегда

Любая страница, любой компонент работает в светлой и тёмной теме. Проверка обеих — обязательна перед коммитом.

- Темы переключаются через `next-themes`
- Все цвета через токены — темы переключаются автоматически
- Никаких `dark:bg-zinc-950 bg-white` — только `bg-background`
- Декоративные элементы (градиенты, mesh) — переопределить в `[data-theme="dark"]` если нужно
- **`dark:` в разметке запрещён вообще, не только на статусах (29.09 доработки · 23, UI-27).** `dark:` — сигнал недостающего токена: заведите токен (пара light/dark в `globals.css` + мост в `tailwind.config.js` + строка в `tailwind-bridge.test.ts`). Так появились `hot`/`hot-text` («горящее окошко»), `rating` (звёзды в каталоге), `info` (синяя точка), `decor-primary`/`decor-magenta` (пятна за заголовками, прозрачность из темы) и `bg-wordmark` (подпись логотипа прямо на фоне страницы). Палитра Tailwind (`text-red-600`, `bg-emerald-500`) — то же: у одиночного светлого класса нет тёмного близнеца.
- **Ратифицированные исключения — посайтово, маркером `// dark-ok: <причина>` строкой выше** (сторож `src/lib/ui/dark-override-inventory.test.ts`, инвентарь пуст): шкала теплокарты загрузки в аналитике мастера (5 ступеней), цвета заглушек аватаров (`components/ui/avatar-tones.ts`, 6), цвет источника «Приложение» в аналитике студии (2), подложка героя студии без фото (всегда тёмная), мягкая версия бренд-градиента кнопки подписки на горящие окошки в тёмной теме. Новый маркер — только с решением владельца (23.3: данные и категории — да, статус — нет).

---

## 4. Типографика — две гарнитуры

| Роль | Гарнитура | Применение |
|---|---|---|
| Display | **Playfair Display** | h1, заголовки секций, курсивные акценты, цитаты, hero (только ≥18 px) |
| UI / Body | **Playfair Display** | весь интерфейс, кнопки, формы, описания, навигация |
| Mono | **Playfair Display Mono** | токены, code, метки в админ-панели |

**Курсивный Playfair Display — фирменный жест.** Высококонтрастный didone-серифник. Используется в одном слове заголовка для акцента: «Тон <em>и&nbsp;ритм</em>», «Запишитесь к <em>лучшим</em>». Не злоупотреблять — один курсивный фрагмент на блок. **Не использовать ниже 18 px** — тонкие штрихи теряются. На бренд-градиенте (бордовый фон, белый текст) — `font-semibold` или выше.

**Шкала** (см. визуальный референс):
- display-xl 72/1.0 · display-lg 48/1.05 · display-md 36/1.1
- h1 32/1.15 · h2 24/1.25 · h3 18/1.4
- body 16/1.6 · small 14/1.5 · mono 13/1.5
- **ниже 12px — только ступени конфига** (29.09 доработки · 25, UI-22): `text-xs` 12 · `text-2xs` 11 · `text-3xs` 10. Высоту строки ступени не задают (строка без `lineHeight` — как прежний `text-[10px]`). `text-[Npx]` меньше 12px не пишется; меньше 10px не бывает вовсе (решение 25.1: 10px — только «бровь», плашка и счётчик; обычный текст — от 11px). Сторож — `src/lib/ui/type-scale-inventory.test.ts`.
- **«Бровь»** — подпись над полем, шапка колонки, надзаголовок карточки: класс `eyebrow` (`globals.css`, слой компонентов: моно 10px, прописные, разрядка `0.18em`, `text-text-sec`). Размер и цвет вызывающего побеждают: `eyebrow text-2xs`, `eyebrow text-accent-text`. Своих `font-mono uppercase tracking-[…]` для подписи не собирать.
- **Плашка состояния** («Неактивна», «VIP», «Есть ответ») — `<Badge size="xs" variant=…>`, не `<span className="rounded-full …">` (§6).

---

## 5. Сетка, радиусы, тени

- **Шаг:** 4 px. Все отступы кратны 4. Tailwind `p-1` = 4 px, `p-4` = 16 px и т.д.
- **Контейнер:** `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- **Радиусы — ступени Tailwind, своих в конфиге нет:** `rounded` 4 · `rounded-md` 6 · `rounded-lg` 8 · `rounded-xl` 12 (база полей и мелких карточек) · `rounded-2xl` 16 (карточки) · `rounded-3xl` 24 (крупные панели, шторки) · `rounded-full` — пилюли и переключатели. `rounded-[Npx]` не пишется (решение 25.3: 20 → `2xl`, 22–32 → `3xl`); единственное исключение — составной хвост пузыря чата, с маркером `// type-ok: <причина>` строкой выше. Острых углов в карточках и кнопках **не существует**.
- **Тени:** всегда с прозрачностью бренда, не сплошной чёрный. `shadow-brand` = `0 12px 40px -8px rgba(114,8,8,0.20)`.

---

## 6. Компоненты — только из `src/components/ui/`

<!-- UI-24: таблица сверена с кодом (`src/components/ui/`). Правило синхронизации:
     меняешь union вариантов/размеров в компоненте — правь строку здесь В ТОМ ЖЕ
     изменении. Документированные, но не существующие компоненты (`Alert`,
     `EditableField`, `CardFooter`) отсюда удалены: агент писал бы несуществующие
     импорты и варианты. -->

| Нужно | Используется |
|---|---|
| Кнопка | `<Button variant="primary|secondary|ghost|danger|icon|wrapper|inverted" size="sm|md|lg|icon|none">` (дефолты: `primary`, `md`); `ref` — обычный проп |
| Кнопка без стилей проекта | `<BareButton>` — только для сред без Tailwind (`app/global-error.tsx`) |
| Поле ввода | `<Input variant="default|bare">`, `<Textarea variant="default|bare">` (для форм с явной отправкой; `bare` — поле внутри чужой рамки: строка поиска в шапке, поле чата); `ref` — обычный проп |
| Inline-edit (кабинет, §7) | `<InlineEditInput underline="always|focus|none">`, `<InlineEditTextarea>`, `<InlineEditField empty multiline>` (режим чтения), `<InlineEditPencil aria-label>` — `components/ui/inline-edit.tsx` |
| Оценка 1–5 | `<StarRatingInput value onChange size="md|lg">` (бордовые звёзды, как в `clientReviews.js`) |
| Выбор файла | `<FileInput mode="hidden|label-target|overlay">` + кнопка-триггер `Button variant="secondary"` (или `Button asChild` над `<span>` внутри `<label>`); видимый нативный `type="file"` запрещён |
| Ползунок | `<RangeInput>` |
| Подложка «клик мимо закрывает меню» | `<DismissLayer label onDismiss className="z-…">` |
| Ловушка для ботов | `<HoneypotField name value onChange label>` |
| Плашка состояния в форме/карточке | `<Notice tone="danger|warning|success|info|muted">` (ошибка — `role="alert"`) |
| Чип (тег, причина, быстрая вставка, пресет) | `<ChipButton active>` |
| Выбор из набора опций (правила, шаги) | `<ChipGroup value onChange options size>` |
| Карточка-переключатель режима | `<ModeCard active title description icon onClick>` |
| Карточка | `<Card>`, `<CardHeader>`, `<CardContent>` |
| Бейдж | `<Badge variant="default|success|warning|danger|info|muted" size="md|xs">` (`xs` — плашка состояния в строке: моно 10px, прописные, `tracking-wide`, `px-2 py-0.5`; цвет — только из варианта) |
| Переключатель | `<Switch>` |
| Чекбокс | `<Checkbox size="sm|md">` |
| Вкладки и фильтры списка | `<Tabs items value onChange ariaLabel>` (item: `badge` — счётчик, `icon`, `disabled`, `testId`) для 4+ вариантов или со счётчиком; `<SegmentedTabs options value onChange ariaLabel disabled>` для 2–3 вариантов (option: `badge`, `icon`). Один вид во всех кабинетах (решение 22.2) |
| Селект | `<Select variant="default|borderless">` (`borderless` — внутри чужой рамки, сортировка «иконка + список»); `ref` — обычный проп |
| Кнопка-значок поверх фото | `<PhotoActionButton label onClick>` — зона 40px, кружок 32px на тёмном стекле, видна всегда (не «при наведении») |
| Короткое сообщение (итог действия) | `const toast = useToast()` → `toast.success(text)` / `toast.error(text)` / `toast.info(text)` (`src/components/ui/toast.tsx`). `window.alert` запрещён (`no-alert` = error) |

**Правило (29.09 доработки · 22, UI-26):** сырой `<button>` / `<input>` / `<select>` / `<textarea>` (и любой `<m.button>`) вне `src/components/ui/` не пишется — сторож `src/components/ui/raw-controls-inventory.test.ts`, инвентарь пуст. Даже подложки, скрытый выбор файла, ползунок и ловушка для ботов идут через примитивы (решение владельца 22.1). Исключение, если оно когда-нибудь понадобится, — посайтово: `{/* raw-control-ok: <причина> */}` строкой выше тега. Никаких локальных копий компонентов в `features/`.

**Выключенная кнопка с подсказкой.** `Button` при `disabled` ставит `pointer-events-none` — `title` у выключенной кнопки не покажется. Если подсказка объясняет, ПОЧЕМУ нельзя (окно изменений прошло, уже пожаловались), — `aria-disabled` + проверка в `onClick` + классы `aria-disabled:…`, а не `disabled`.

Если компонента нет — добавить его в `src/components/ui/` и использовать оттуда. Не делать одноразовые.

---

## 7. Главный паттерн — inline-edit с автосохранением

В кабинете (профиль, настройки, услуги, клиенты, заметки) используется **inline-редактирование**, не формы. Никаких кнопок «Сохранить».

**Поведение:**
- Read-mode по умолчанию: значение + бледный карандашик справа (виден на hover)
- Клик по строке или Enter/Space с фокусом → edit-mode: поле с подчёркнутой `border-bottom: 2px primary` (не рамка)
- `input` event → debounce 700 мс → save
- `blur` → save немедленно (отменяет debounce)
- `Enter` → save сразу (для однострочных)
- `Cmd/Ctrl+Enter` → save (для textarea)
- `Escape` → отмена, возврат исходного значения
- Индикатор статуса слева от значения: «Сохраняется» (спиннер) → «Сохранено» (✓, держится 1.8 сек) → пусто

**Контракт автосохранения:**
- Optimistic UI — значение в интерфейсе обновляется до подтверждения сервера
- При ошибке сети — 3 повтора с экспоненциальной задержкой (300 → 900 → 2700 мс)
- При финальном провале — откат + алёрт «Не удалось сохранить. Попробуйте ещё раз.»
- Blur всегда сохраняет — никогда не теряем введённое

**Когда не использовать inline-edit:** логин/OTP, бронирование, оплата, поиск, любой флоу с явной кнопкой действия. Там — обычные `<Input>` в форме.

Визуальный референс — раздел 08 в `docs/design-system/МастерРядом - Design System.html`.

---

## 8. Тексты — только через UI_TEXT

```ts
// ❌ нельзя
<Button>Записаться</Button>

// ✅ можно
<Button>{UI_TEXT.booking.submit}</Button>
```

- Все пользовательские строки — в `UI_TEXT` (`src/lib/ui/text.ts`); ключ кладётся в файл своего домена `src/lib/ui/text/<домен>.ts`
- Импорт — только пространством имён: `import * as UI_TEXT from "@/lib/ui/text"`. Обращение `UI_TEXT.<домен>.…` — и браузер получает только нужные домены. `UI_TEXT` целиком (`const T = UI_TEXT`, аргументом) или `UI_TEXT[ключ]` в клиентском компоненте отдаёт ему ВСЕ тексты (29.09 доработки · 18)
- Компонент шелла (топбар, нижняя навигация, футер, страницы ошибок) берёт ключи только из маленьких доменов шелла (`nav`, `common`, `notifications`, `footer`…) — ключ крупного домена в шелле едет на каждую страницу
- Не строить логику на тексте: `if (status === "Подтверждена")` — никогда. Только `if (status === BookingStatus.CONFIRMED)`.
- CTA = глагол: «Записаться», «Сохранить», «Удалить», «Применить фильтры»
- Ошибка: «Не удалось {действие}. Попробуйте ещё раз.»
- Empty state: одна фраза + одна кнопка-действие. Не дрожать, не извиняться.

### 8a. Даты, числа, деньги — только через `UI_FMT`

> 29.09 доработки · 24 (UI-20). `Intl.*`, `toLocale*` и литерал «₽» вне `lib/ui/fmt.ts`, `lib/format.ts`, `lib/schedule/timezone.ts`, `lib/ui/zone-label.ts`, `lib/time/use-viewer-timezone.ts` валят `src/lib/ui/format-sites-inventory.test.ts`.

- **Тексты не форматируют.** В `lib/ui/text/*` нет `Intl` и `toLocale`: функция текста принимает готовую строку (`weeklyStats.body(n, UI_FMT.priceLabel(kopeks))`). «₽» как слово («Цена, ₽») — в текстах можно.
- **Деньги (копейки):** `UI_FMT.priceLabel` — «4 500 ₽», ноль — «0 ₽» (цена услуги «бесплатно»); `UI_FMT.priceLabelOrDash` — «—» для нуля и `null` (таблицы, KPI, история визитов); `UI_FMT.moneyShort` — «4,2 млн ₽» / «12 тыс ₽» (KPI, оси графиков); `moneyRUBFromKopeks` — точные суммы с копейками (возвраты, платежи). Перед «₽» — **неразрывный** пробел: его ставит хелпер, руками не собирать.
- **Счётчики:** `UI_FMT.count` — «1 412»; `UI_FMT.countShort` — «1,2 тыс» / «4,2 млн»; `UI_FMT.decimal(n, k)` — ровно k знаков. Латинских «12K» / «1.2M» в продукте нет (решение 24.1).
- **Даты:** у каждого формата пояс — обязательный аргумент: пояс салона/кабинета (rule 17, с меткой `formatZoneLabel`), `"UTC"` для ключей и осей, либо `VIEWER_TZ` — часы зрителя (только клиентский код; на сервере это часы контейнера, сторож краснеет). Формы — `UI_FMT.date(value, preset, { timeZone })`: `dayMonthShort` «29 сент.», `dayMonthLong` «29 сентября», `dayMonthYearLong`, `weekdayDayMonthShort` «пн, 29 сент.», `dayMonthShortTime` «29 сент., 14:30» и др. (список — `DATE_PRESETS` в `fmt.ts`); месяц словом — без ведущего нуля у дня. Дата-ключ салона `YYYY-MM-DD` — `UI_FMT.dateKey(key, preset)`, ключ из момента — `toLocalDateKey` / `toLocalMonthKey`.
- **Часы зрителя в SSR-компоненте** (время суток, «пришло в 14:30») — показывать после гидратации (`useIsHydrated()`), иначе сервер в поясе контейнера и браузер расходятся.

---

## 9. Движение — служебное

> 29.09 доработки · 19 (PERF-12 + UI-12, решение владельца 19.1): один набор движения и лёгкий framer. Всё ниже держат сторожа `src/lib/ui/motion-imports.test.ts` и `src/lib/ui/motion-canon.test.ts` — отступление краснеет в CI.

- Библиотека: **framer-motion**, но компоненты пишут **`m.*`, а не `motion.*`**: `import { m } from "framer-motion"`. Корень держит `<LazyMotion features={domAnimation} strict>` (`components/providers/motion-provider.tsx`) — `motion.*` внутри `strict` бросает в рантайме. CSS keyframes — только для атомарных вещей (спиннер, пульсация точки статуса).
- **Переход — только из `src/lib/ui/motion.ts`**, литералов `duration:` / `ease:` в компонентах нет:
  - `MOTION.micro` (0.18 с) — отклик элемента: меню, подсказка, иконка; `MOTION.base` (0.28 с) — модалка, смена шага; `MOTION.section` (0.45 с) — появление секции при прокрутке; `MOTION.exit` (0.18 с, кривая ухода) — уход и сворачивание (`exit={{ …, transition: MOTION.exit }}`);
  - `SPRING_SHEET` — шторки и нижние меню; `STAGGER` (0.08) — ступеньки в сетке; `DISTANCE.rise` (16 px) / `.nudge` (6 px) — сдвиг появления, выезд снизу — `"100%"`; `VIEWPORT_ONCE` — `viewport` появления;
  - кривая одна — `EASE` `[0.22, 1, 0.36, 1]`; в классах Tailwind — `ease-brand`.
- **Reduced motion — не в компоненте.** `MotionConfig reducedMotion="user"` сам гасит transform (сдвиг, масштаб, поворот), прозрачность оставляет. Поэтому **не писать** `reduce ? { duration: 0 } : …` и **никогда** не делать `initial` зависимым от `useReducedMotion()`: сервер всегда «не просил», клиент «просил» → расхождение гидратации и блок, застрявший в `opacity: 0`. `useReducedMotion` остаётся только там, где решение не про transform: раскрытие по высоте (`reduce ? INSTANT : MOTION.base`), бесконечная анимация, автоплей, перетаскивание.
- **Hover и нажатие — классами** из `components/ui/motion-classes.ts`, не `whileHover` / `whileTap` (пропсы тащат framer): карточка — `HOVER_LIFT` (подъём 2 px), фото в карточке (`group`) — `IMAGE_ZOOM` (1.03), карточка/иконка-кнопка — `PRESS` (0.97; у `Button` своё — 0.99). Иконкам hover-масштаб не нужен. ⚠️ На элементе, который анимирует framer, класс `hover:`/`active:`-transform не сработает — framer оставляет inline-`transform`; вешать класс на вложенный элемент.
- Tailwind-длительности: `duration-200` (микро и hover), `duration-500` (фото). Другие — нет.
- **`layout` / `layoutId` / `drag` в лёгком наборе молча не работают.** Не заводить: плавающая полоса — CSS (`transform` + `transition-transform`, как индикатор нижней панели), перестройка стопки — схлопывание высоты (как тосты). Острова с полным набором (`domMax`) — только в реестре сторожа: сториз (`drag`, ленивый модуль) и лента `/notifications` (`layout`, `domMax` догружается чанком).
- Базовый паттерн появления секции:

```tsx
import { m } from "framer-motion";
import { DISTANCE, MOTION, VIEWPORT_ONCE } from "@/lib/ui/motion";

<m.div
  initial={{ opacity: 0, y: DISTANCE.rise }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={VIEWPORT_ONCE}
  transition={MOTION.section}
>
```

- Намеренное исключение из канона (не переход, а таймер или API чужой библиотеки) — метка `// motion-canon: <причина>` перед сайтом и строка в реестре `MARKED_SITES` сторожа.

**Запрещено:** бесконечные пульсации, отскоки, вращение лого, параллакс на мобильных, hover-эффекты, отвлекающие от чтения.

---

## 10. Иконки

- **Lucide React** только. Никаких других наборов.
- Толщина: 1.5 px. Размеры: 16 / 20 / 24 px.
- Цвет — наследуется от родителя через `currentColor`.
- Иконка — поддержка текста, не замена. Кнопка с одной иконкой допустима в icon-mode (`size="icon"`) с `aria-label`.

---

## 11. Изображения

- Только `next/image`. `<img>` запрещён в видимых местах.
- `placeholder="blur"` для контентных картинок где есть blurDataURL.
- `priority` только для LCP-изображений.
- Скруглённость через `rounded-lg/xl/2xl` на родителе с `overflow-hidden`.

---

## 12. Адаптивность — mobile-first

Все стили начинаются с мобильных, потом расширяются:

```tsx
// ✅
<h1 className="text-3xl md:text-5xl lg:text-6xl">

// ❌
<h1 className="text-6xl md:text-3xl">
```

Брейкпоинты Tailwind по умолчанию: `sm 640`, `md 768`, `lg 1024`, `xl 1280`. Сетки карточек: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.

---

## 13. Workflow при редизайне страницы

1. **Audit:** прочитать существующий код страницы, найти все usages, проверить текущие тесты. Не ломать логику.
2. **Inventory:** что на странице — какие данные, какие действия, какие состояния (loading/empty/error). Зафиксировать.
3. **Map to design system:** какой раздел `docs/design-system/...html` ближе. Какие компоненты из `src/components/ui/` уже подходят. Чего не хватает.
4. **Текст:** все строки — в `UI_TEXT`. Если в коде хардкод — добавить ключи в файл домена `src/lib/ui/text/<домен>.ts`.
5. **Темы:** обе с самого начала. Не «потом сделаем тёмную».
6. **Анимации:** добавляются последним слоем, на готовый layout.
7. **Проверка по чеклисту** (см. ниже) перед коммитом.

---

## 14. Чеклист перед коммитом — UI

- [ ] Все цвета через токены (`bg-primary`, не `bg-[#720808]`)
- [ ] Нет `text-[Npx]` меньше 12px и `rounded-[Npx]` — только ступени (`text-2xs`/`text-3xs`, `eyebrow`, `Badge size="xs"`, `rounded-2xl`/`3xl`)
- [ ] Все строки через `UI_TEXT`, не хардкод
- [ ] Только shared-компоненты, нет локальных кнопок/инпутов
- [ ] Светлая и тёмная темы проверены вручную
- [ ] Mobile (320 / 375 / 414) проверен
- [ ] Анимации через framer-motion (`m.*`, переходы из `MOTION`), не CSS keyframes; hover/нажатие — классами `HOVER_LIFT` / `IMAGE_ZOOM` / `PRESS`
- [ ] Иконки из lucide-react
- [ ] Изображения через next/image
- [ ] Loading / empty / error состояния продуманы
- [ ] Inline-edit (если кабинет) — с автосохранением, без кнопки «Сохранить»
- [ ] `npm run typecheck && npm run lint` проходят

---

## 15. DO / DON'T — короткий список на стене

| ✅ Можно | ❌ Нельзя |
|---|---|
| `bg-page`, `text-main`, `bg-primary` | `bg-[#720808]`, `style={{...}}`, `bg-violet-600` |
| Playfair Display + Playfair Display | Inter, Roboto, Space Grotesk, Arial |
| Один primary CTA на экран | Два primary CTA рядом |
| Inline-edit в кабинете | Кнопки «Сохранить» в кабинете |
| `<Button>{UI_TEXT.action}</Button>` | `<Button>Сохранить</Button>` |
| `<m.div transition={MOTION.base}>` для анимаций | `<motion.div>`, литеральные `duration`/`ease`, CSS keyframes (кроме спиннера) |
| Lucide-иконки 1.5 px | Heroicons / FontAwesome / эмодзи как иконки |
| `next/image` | `<img>` в видимых местах |
| `rounded-lg/xl/2xl` | острые углы в карточках |
| Тени с прозрачностью бренда | Сплошные чёрные тени |
| Обе темы | Только светлая |
| Empty state: одна фраза + одна кнопка | Многоэкранный диалог в empty |
| «Не удалось {действие}» | «Error 500» / «Что-то пошло не так!!!» |

---

## 16. Available patterns в проекте

> Выученные в sprint редизайна кабинета мастера (`newDesignSystem`). Прежде чем катить новый компонент — проверь есть ли подходящий pattern здесь.

### MasterPageHeader — sticky cabinet header

Каждая cabinet master страница рендерит свой `<MasterPageHeader>` как **первый element content area**. Не layout-level. Sticky `top-[var(--topbar-h)] z-20`, backdrop blur, border-b.

```tsx
<MasterPageHeader
  breadcrumb={[
    { label: "Кабинет", href: "/cabinet/master/dashboard" },
    { label: "Текущая страница" },
  ]}
  title="Заголовок страницы"
  subtitle="Подзаголовок"
  actions={<><SaveStatusIndicator /><Button variant="primary">+ Действие</Button></>}
/>
```

Файл: `src/features/master/components/master-page-header.tsx`.

### ChipGroup — segmented control

Pill-style сегментированный селектор для дискретных options. Используется для slot step, booking window, hot slot triggers, visibility days, cancellation hours.

```tsx
<ChipGroup
  value={value}
  onChange={onChange}
  options={[
    { value: 1, label: "1 час" },
    { value: 2, label: "2 часа" },
    { value: 4, label: "4 часа" },
  ]}
/>
```

Файл: `src/components/ui/chip-group.tsx` (перенесён из кабинета мастера в 29.09 доработки · 22 — его импортирует и студия).

### SettingRow — settings layout

Title + subtitle слева, control справа. Внутри Card делится через `divide-y divide-border-subtle`.

```tsx
<SettingRow
  title="Минимум за"
  subtitle="Раньше этого окна слот скрывается"
  control={<ChipGroup ... />}
/>
```

Файл: `src/features/master/components/schedule-settings/components/setting-row.tsx`.

### ModeCard — large card-toggle

Big-tap target с icon + title + description. Brand border + ring при active.

```tsx
<ModeCard
  active={value === "FLEXIBLE"}
  onClick={() => onChange("FLEXIBLE")}
  icon={Clock}
  title="Гибкий режим"
  description="Например: 10:00–20:00 с обедом 13:00–14:00..."
/>
```

Use cases: Hours mode toggle (FLEXIBLE/FIXED), Confirmation toggle (Auto/Manual), Exception type selector (OFF/TIME_RANGE).

Файл: `src/components/ui/mode-card.tsx` (перенесён в 29.09 доработки · 22; `aria-pressed`, фирменное кольцо фокуса).

### Auto-save pattern

Debounced 500 мс PATCH + status indicator. Status: `idle / saving / saved / error`. После `saved` авто-сброс в `idle` через 1.8 c.

```tsx
const { setStatus, setErrorMessage } = useSaveStatus();

useAutoSave({
  value: draft,
  baseline,
  save: async (value) => {
    const response = await fetch("/api/.../endpoint", {
      method: "PATCH",
      body: JSON.stringify(value),
    });
    if (!response.ok) return { ok: false, message: "..." };
    return { ok: true };
  },
  setStatus,
  setErrorMessage,
  onSaved: (value) => setBaseline(value),
});
```

Status chip рендерится через `<SaveStatusIndicator>` в `actions` slot `MasterPageHeader`. Provider `<SaveStatusProvider>` оборачивает page header + body.

Файлы: `src/features/master/components/schedule-settings/use-auto-save.ts`, `save-status-provider.tsx`, `save-status-indicator.tsx`.

### Empty states

Centered icon + title + description + secondary CTA.

```tsx
<div className="flex flex-col items-center justify-center px-4 py-12 text-center">
  <CalendarX className="mb-3 h-12 w-12 text-text-sec/40" aria-hidden />
  <p className="mb-1 font-display text-base text-text-main">Пока нет исключений</p>
  <p className="mb-4 max-w-xs text-sm text-text-sec">Добавьте отпуск, праздники или сокращённый день.</p>
  <Button variant="secondary" size="md" onClick={onAction}>
    <Plus className="mr-1.5 h-4 w-4" /> Добавить исключение
  </Button>
</div>
```

### Status badges/chips (booking statuses → цвета)

| Группа | Статусы | Тон |
|---|---|---|
| pending | PENDING / CHANGE_REQUESTED | `warning-*` (внимание) |
| confirmed | CONFIRMED / PREPAID | `success-*` (готово) |
| today/in-progress | IN_PROGRESS / STARTED | акцент бренда `bg-primary/10 text-accent-text` (rose снят, 29.09 · 23) |
| done | FINISHED | `success-*` (нейтральное завершение) |
| cancelled | CANCELLED / REJECTED / NO_SHOW | `Badge variant="muted"` / `bg-muted text-muted-foreground` |

Ошибки, отмены, отказы и «опасная зона» — один красный: `danger-*` (плашка — `<Notice tone="danger">`), заливка-основа `bg-destructive/<alpha>` (решение владельца 23.1). Точки и тонированные заливки статуса — `bg-success|warning|destructive|info/<alpha>` (у этих мостов есть `<alpha-value>`).

**UI-26/27 (AUDIT-CAMPAIGN-02 п.8, 2026-08-10): статусные ПОВЕРХНОСТИ — только токены.** Для заливки/текста/рамки статусных плашек, пилюль и алертов существует тройка токенов на статус: `bg-success-surface text-success-text border-success-border` (+ `warning`/`danger`/`info`). Значения сняты с `Badge.variantClasses` (контраст-ревью пройден), тёмная тема встроена в переменные — **`dark:`-вилки на статусных поверхностях больше не пишутся**. Сырые `emerald-*`/`amber-*`/`red-*`/`blue-*` комбинации запрещены; `rose`/`slate` — тоже (29.09 доработки · 23: рейтинг — токен `rating`, «приглушено» — `muted`), кроме ратифицированного списка в §3. ⚠️ Модификаторы прозрачности к этим классам не применяются (`bg-success-surface/50` не сработает — альфа тёмной темы запечена в переменную). Предпочтительно вообще не собирать плашку руками, а брать `<Badge variant="…">`.

### `cn` — побеждает последний аргумент (tailwind-merge)

**29.09 доработки · 12 (CN-MERGE-PROPOSAL).** `cn` (`src/lib/cn.ts`) построен на **`tailwind-merge` 2.x**: при конфликте двух утилит одной группы побеждает ПОСЛЕДНИЙ аргумент. `cn(дефолт примитива, className)` отдаёт класс вызывающего — у `Button`, `Input`, `Badge`, `Card`, `Skeleton`, `StatTile` и любого другого примитива. Своего механизма «дефолт, если группу не трогали» больше нет (`defaultUnlessOverridden` удалён).

История, чтобы не возвращаться: пока `cn` был плоским join, побеждал **порядок правил в собранном CSS**, свой у каждого семейства (цвета фона — по алфавиту токена, отступы — по осям, радиусы — по величине). «Написал класс — не применился» возвращалось пять раз (FIX-ROUND-02, UI-26 — `wrapper` глушил заливку трёх поверхностей, CN-CONFLICT-CLASS — 93 коллизии, PWA-FIX-12 — ширина `Input`, «Удалить работу» не красная), к 29.09 — ~95 живых мест. `check:dead-classes` этот класс не видел по построению: правило есть, оно просто проигрывало.

**Что знать автору:**
- **`leading-*` — ПОСЛЕ размера шрифта.** В Tailwind 3 `text-sm` задаёт и высоту строки, поэтому `cn("leading-tight", "text-sm")` выбрасывает `leading-tight`. Пиши `text-sm leading-tight`.
- **Брейкпоинт снимается только своим брейкпоинтом.** `p-5` вызывающего перебивает `px-5 pb-5` примитива, но не `md:px-6 md:pb-6` — «везде p-5» пишется `p-5 md:p-5` (так у ролей-карточек `/cabinet/roles` и `CardContent` гостевой записи).
- **Новая тень или фон-картинка** в `tailwind.config.js` — только вместе с записью в `extendTailwindMerge` в `cn.ts`. Без неё `shadow-card` читается ЦВЕТОМ тени (`cn("shadow-card", "shadow-primary/20")` выбросил бы тень), а `bg-brand-gradient` — цветом фона. Сторож — `src/lib/cn.test.ts`, он читает конфиг и краснеет на незарегистрированном ключе. Цвета, `font-display`, экран `xs` и авторские классы (`lux-*`, `glass-panel`, `scrollbar-hide`) работают без расширения.
- **`tailwind-merge` 3.x запрещён**, пока проект на Tailwind 3 — он понимает только Tailwind 4.

### Выбор варианта `Button`

Класс вызывающего теперь побеждает у любого варианта, но выбор варианта — это выбор вида, а не способ обойти конфликт:

| Нужно | Вариант | Почему |
|---|---|---|
| своя заливка (`bg-*`, `hover:bg-*`) или свой цвет текста | **`wrapper`** | единственный без хрома: не объявляет ни `bg-`, ни `text-`, ни `hover:bg-` — «прозрачность» даёт preflight (`button { background-color: transparent; color: inherit }`) |
| «опасное» тихое действие («Удалить кабинет», «Отменить запись») | **`wrapper`** + `text-danger-text hover:bg-danger-surface` | не `ghost` + сырой `text-rose-700`: статусные цвета — токенами (UI-26/27), тёмная тема встроена |
| тихая кнопка без заливки | `ghost` | свой `text-text-main` и hover — собирать поверх них чужую палитру значит переопределять половину варианта |
| рамка + `bg-bg-input` + inset-блик | `secondary` | это готовый вид, собирать руками не надо |
| иконка | `icon` (`size="icon"`) | зона нажатия ≥44px из UI-29 |
| светлая заливка на бренд-градиенте | `inverted` | фиксированная пара белый + `text-primary` (не переворачивается в тёмной теме) |

Пин «`wrapper` без хрома» — `src/components/ui/button-wrapper-chromeless.test.ts`.

### Горизонтальная полоса — скроллер и дорожка на РАЗНЫХ элементах

**FIX-D2 (2026-08-17).** Вкладки, чипы, карусели, которым на мобильном не хватает ширины, прокручиваются **внутри себя**, а страница остаётся ровно шириной экрана. Форма одна на весь проект (`clients-tabs`, `notifications-tabs`, `filter-chips`, `recent-masters-section`, `public-profile/master/section-nav`; команда на странице студии — с 2026-09-24 сетка, не полоса):

```tsx
{/* скроллер: bleed до краёв + свой overflow; scroll-px повторяет px, иначе snap съедает гаттер */}
<div className="-mx-4 overflow-x-auto px-4 scroll-px-4 scrollbar-hide">
  {/* дорожка: шире контейнера — это и есть то, что он прокручивает */}
  <ul className="flex min-w-max gap-2">
    <li className="shrink-0 snap-start">…</li>
  </ul>
</div>
```

🔴 **`min-w-max` и `overflow-x-auto` на ОДНОМ элементе — самозапирающаяся полоса, легитимного случая нет.** `min-width` сильнее `max-width` и `width`: элемент не может стать у́же содержимого, содержимое из него не выпадает, `overflow-x-auto` мёртв по построению — лишняя ширина уезжает в документ. Так жила полоса секций публичного профиля: на 375 px `documentElement.scrollWidth` = 459, а на телефоне мобильный layout-viewport растягивается до содержимого (459×994 при экране 375×812), и всё `fixed bottom-0` — CTA «Записаться», нижняя навигация — оказывается ЗА нижней кромкой экрана. Ни `typecheck`, ни `lint`, ни `check:dead-classes` этого не видят (классы валидны, правила есть). Сторож формы — `lib/ui/horizontal-strip.test.ts` (CI; ловит и разнос по аргументам `cn()`, и `md:`-варианты; слепая форма — класс, принесённый переменной или пропом); сторож поведения — `.qa/no-horizontal-overflow.spec.ts` (живой харнесс: `innerWidth === documentElement.clientWidth` в мобильной эмуляции + реальный тач-пан). ⚠️ **Мерить дефект надо НЕ `window.scrollX` после `scrollTo`:** в мобильной эмуляции он 0 по построению, а в desktop-эмуляции `html { scroll-behavior: smooth }` делает чтение сразу после вызова нулём — так SMOKE-01 записал живой дефект в ложные срабатывания.

### Card-with-toggle (premium feature card)

Большая branded card (brand-gradient, decorative orbs) с toggle. Sub-controls появляются при `isEnabled`. Pre-PRO state — locked card с `Lock` icon + ссылка на `/cabinet/billing`.

Use case: Hot Slots section. Файл: `src/features/master/components/schedule-settings/rules/hot-slots-section.tsx`.

### Multi-day selector (для breaks)

Pill-toggle для каждого дня недели + quick-select buttons (Пн-Пт / Каждый день / Сб-Вс). Multi-select создаёт N rows в БД через transaction.

Файл: `src/features/master/components/schedule-settings/breaks/break-modal.tsx`.

### Слои (z-index) — шкала, а не числа

29.09 доработки · 21 (UI-14). Глобальные слои — токены `tailwind.config.js` → `zIndex`, порядок снизу вверх: `z-sticky` (20, липкие шапки под топбаром) · `z-topbar` (30) · `z-float` (30, плавающие CTA) · `z-nav` (40, нижняя панель, баннер сети, подсказка «Первых шагов») · `z-notice` (45, cookie-уведомление) · `z-prompt` (46, PWA-промпты) · `z-scrim` (49, затемнения листов и шторок) · `z-modal` (50, модалки, шторки, листы) · `z-popover` (60, всплывающие меню) · `z-toast` (70). Локальные слои внутри родителя — `z-0/1/2/10/20/30` числом.

- Числовые `z-40`/`z-50` и любые `z-[…]` — запрещены (сторож `src/lib/ui/z-index-scale.test.ts`).
- **Перекрыть шапку, нижнюю панель или cookie-уведомление — только порталом**: `<AnchoredPortal open anchorRef onDismiss align>` (`components/ui/anchored-portal.tsx`) — `body`, слой `z-popover`, координаты от якоря, клик вне и Escape; открыли с клавиатуры — фокус в первый пункт, мышью — в панель без кольца; Escape и Tab за край — обратно на якорь. `z-[100]` внутри шапки не помогает: `sticky` + `backdrop-blur` предка запирают его на уровне шапки.
- Закреплённое снизу (плавающая кнопка, панель, уведомление) помечать `data-guide-avoid` — подсказка «Первых шагов» поднимается над ним, а не прячется под ним.

### Тост или сообщение в форме

**29.09 доработки · 10 (RES-18).** Короткие сообщения — одна система, `useToast()`: снизу (на телефоне над нижней навигацией), справа снизу на ПК, до трёх, успех и сведения 4 с, ошибка 7 с, пауза при наведении и фокусе, крестик. Текст — строка из `UI_TEXT` или курируемое сообщение сервера, JSX не принимается.

| Ситуация | Где сообщать |
|---|---|
| итог действия, после которого экран меняется или закрывается (удалили, сохранили в таблице админки, отменили запись, подключили Telegram) | **тост** |
| ошибка поля, отказ отправки формы, ошибка внутри открытого окна, требующая действия там же | **в форме рядом с кнопкой** — внутри окна фокус заперт, крестик тоста с клавиатуры недоступен |
| постоянное состояние страницы (запись отменена, ссылка недействительна) | **на странице**, не всплывающее |
| фоновая операция без действия пользователя (пометка «прочитано» при открытии) | **молчать**, но без необработанного отказа промиса (`.catch(() => {})`) |

Свой `useState` + `setTimeout` для «плашки на 2 секунды» не заводить: так жили одиннадцать копий, все в потоке страницы (после прокрутки не видно), ошибки как `role="status"` и сырые `emerald-*`/`red-*`.

### Окно во весь экран на телефоне

`<ModalSurface fullScreenOnMobile stickyFooter footer={…}>` — до `sm` окно становится экраном: закреплённая шапка с крестиком (отступ под «чёлку»), подвал прижат к низу с отступом под «домашнюю полоску»; с `sm` — обычная карточка по центру. Для окон, где главное — фото и длинная форма (портфолио: добавить, изменить, обрезать). Кнопки действия передавать в `footer`, а не в `children` — иначе на телефоне они окажутся посреди экрана.

### Действия над фото — видны всегда

«Появляется при наведении» на телефоне не появляется никогда, а на ПК прячет действие от того, кто не догадался навести (портфолио мастера и студии, 2026-09-29). Изменить / удалить — `PhotoActionButton` прямо на фото; редкие действия — в меню «⋮». Меню, которое шире плитки, — порталом с фиксированной позицией у кнопки и прижатием к краям экрана (плитка с `overflow-hidden` его обрезает), портал — за `useIsHydrated()`.

### Modal-based add/edit

Action button (`+`) → modal с form. Edit pre-fills через lazy `useState` initialiser. Render `{open ? <Modal key={editing?.id ?? "new"} /> : null}` — remount per-open так что начальное состояние всегда свежее (React 19 forbids `setState` в useEffect).

Внутри модалки: TypeCard / DayPicker (range или single) / TimeInput pairs / Action buttons (Отмена / Сохранить или Добавить).

Файлы: `exception-modal.tsx`, `break-modal.tsx`, `reschedule-modal.tsx`.

### AppShellContent conditional (full-width vs constrained)

Global wrapper в `src/components/layout/app-shell-content.tsx`:

```tsx
// pathname.startsWith("/cabinet") || pathname.startsWith("/admin")
//   → full viewport width (workspace surfaces)
// иначе → max-w-screen-2xl mx-auto (marketing surfaces)
```

Все cabinet master pages автоматически получают full-width — не нужно ничего настраивать на уровне страницы.

### Reference-driven редизайн

Перед любым редизайн-коммитом:

1. `view .claude/references/{page}.png` — посмотреть как должно выглядеть
2. Прочитать `.claude/references/{page}.js` если есть — там JSX с tone/structure
3. Сравнить existing code vs reference: какие фичи уже есть, чего не хватает
4. Gap analysis + complexity per item (simple / medium / complex)
5. Scope decision: что в этот коммит, что defer
6. Только потом — план и реализация

---

## Авторитет

Этот файл побеждает все остальные источники по UI. При конфликте с устаревшими комментариями в коде, старыми скиллами, или текстом в issues — следуй ему.

При сомнении — открыть `docs/design-system/МастерРядом - Design System.html` и посмотреть как должно выглядеть.