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
3. `src/lib/ui/text.ts` — **источник текстов**. Все строки — отсюда.
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

---

## 5. Сетка, радиусы, тени

- **Шаг:** 4 px. Все отступы кратны 4. Tailwind `p-1` = 4 px, `p-4` = 16 px и т.д.
- **Контейнер:** `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`
- **Радиусы:** `rounded-lg` (12 px) — базовый. `rounded-xl/2xl` для крупных карточек. `rounded-full` — пилюли и переключатели. Острых углов в карточках и кнопках **не существует**.
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
| Кнопка | `<Button variant="primary|secondary|ghost|danger|icon|wrapper|inverted" size="sm|md|lg|icon|none">` (дефолты: `primary`, `md`) |
| Поле ввода | `<Input>`, `<Textarea>` (для форм с явной отправкой) |
| Карточка | `<Card>`, `<CardHeader>`, `<CardContent>` |
| Бейдж | `<Badge variant="default|success|warning|danger|info|muted">` |
| Переключатель | `<Switch>` |
| Чекбокс | `<Checkbox size="sm|md">` |
| Вкладки | `<Tabs>`, `<SegmentedTabs>` |
| Селект | `<Select>` |

**Правило:** `<button>` без обёртки в `<Button>` — нарушение, кроме случаев, где это headless-примитив Radix. Никаких локальных копий компонентов в `features/`.

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

- Все пользовательские строки — в `src/lib/ui/text.ts`
- Не строить логику на тексте: `if (status === "Подтверждена")` — никогда. Только `if (status === BookingStatus.CONFIRMED)`.
- CTA = глагол: «Записаться», «Сохранить», «Удалить», «Применить фильтры»
- Ошибка: «Не удалось {действие}. Попробуйте ещё раз.»
- Empty state: одна фраза + одна кнопка-действие. Не дрожать, не извиняться.

---

## 9. Движение — служебное

- Библиотека: **framer-motion**. CSS keyframes — только для атомарных вещей (спиннер, пульсация точки статуса).
- Длительность: 200–500 мс. Длиннее 700 — никогда.
- Easing: `[0.22, 1, 0.36, 1]` (cubic-bezier) — стандарт по проекту.
- Базовый паттерн появления секции:

```tsx
<motion.div
  initial={{ opacity: 0, y: 16 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-80px" }}
  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
>
```

- Stagger между карточками в сетке: `staggerChildren: 0.08`
- Hover карточек: `whileHover={{ y: -2 }}`
- Tap кнопок: `whileTap={{ scale: 0.97 }}`

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
4. **Текст:** все строки — в `UI_TEXT`. Если в коде хардкод — добавить ключи в `text.ts`.
5. **Темы:** обе с самого начала. Не «потом сделаем тёмную».
6. **Анимации:** добавляются последним слоем, на готовый layout.
7. **Проверка по чеклисту** (см. ниже) перед коммитом.

---

## 14. Чеклист перед коммитом — UI

- [ ] Все цвета через токены (`bg-primary`, не `bg-[#720808]`)
- [ ] Все строки через `UI_TEXT`, не хардкод
- [ ] Только shared-компоненты, нет локальных кнопок/инпутов
- [ ] Светлая и тёмная темы проверены вручную
- [ ] Mobile (320 / 375 / 414) проверен
- [ ] Анимации через framer-motion, не CSS keyframes
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
| `<motion.div>` для анимаций | CSS keyframes, кроме спиннера |
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

Файл: `src/features/master/components/schedule-settings/components/chip-group.tsx`.

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

Файл: `src/features/master/components/schedule-settings/components/mode-card.tsx`.

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
| pending | PENDING / CHANGE_REQUESTED | amber (внимание) |
| confirmed | CONFIRMED / PREPAID | emerald (готово) |
| today/in-progress | IN_PROGRESS / STARTED | rose (active state) |
| done | FINISHED | emerald (нейтральное завершение) |
| cancelled | CANCELLED / REJECTED / NO_SHOW | slate (mute) |

Tailwind built-ins (red/amber/emerald/rose/slate) — допустимо для статус-индикаторов; для всего остального — только семантические токены.

### Card-with-toggle (premium feature card)

Большая branded card (brand-gradient, decorative orbs) с toggle. Sub-controls появляются при `isEnabled`. Pre-PRO state — locked card с `Lock` icon + ссылка на `/cabinet/billing`.

Use case: Hot Slots section. Файл: `src/features/master/components/schedule-settings/rules/hot-slots-section.tsx`.

### Multi-day selector (для breaks)

Pill-toggle для каждого дня недели + quick-select buttons (Пн-Пт / Каждый день / Сб-Вс). Multi-select создаёт N rows в БД через transaction.

Файл: `src/features/master/components/schedule-settings/breaks/break-modal.tsx`.

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