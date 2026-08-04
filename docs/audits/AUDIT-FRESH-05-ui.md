# AUDIT-FRESH-05 — Консистентность фронтенда, анимации, тёмная тема, a11y — Отчёт

> Дата: 2026-08-04 · Ветка: `main`, рабочее дерево на `5a37b0a` (чистое) · Режим: **read-only** (изменён только этот файл).
> Метод доказательства: каждое утверждение — либо `файл:строка` + цитата, либо **прогон реального компилятора Tailwind** над зондом (см. §Метод). Догадки вынесены в отдельную секцию.

---

## Метод

### Что осмотрено
Дизайн-система (`.claude/skills/ui-ux-pro-max/SKILL.md` — вызван первым, до любой работы), `CLAUDE.md`, `docs/QUALITY-GATES.md`, `MASTERRYADOM_AI_CONTEXT.md`, `eslint.config.mjs`, `tailwind.config.js`, `src/app/globals.css`, примитивы `src/components/ui/*`, шеллы и layout-обёртки, кабинеты master/studio/client/admin, публичные профили, booking-флоу, `/login`, e-mail-шаблоны, OG-роут. `redesign.md` в корне **не существует** (проверено `ls`); есть `docs/design-system/pages/`.

### Ключевой инструмент: компиляция зонда
Проектный урок «токен живёт в ДВУХ местах» проверялся не грепом, а **фактической сборкой**: из всего `src/` извлечены 1745 кандидатов-классов, из них 1348 базовых утилит собраны в зонд-файл и скомпилированы настоящим `npx tailwindcss` (v3.4.17) с боевым `tailwind.config.js` + `globals.css`. Класс, не породивший CSS-правила, — **мёртвый** (разметка есть, стиля нет, ошибки нет). Все находки категории «мёртвый класс» ниже подтверждены этим способом и перепроверены точечными зондами.

### Прогнанные команды и результат

`npm run check` — **14 из 15 шагов зелёные, 1 падает по среде.**

| # | Шаг | Результат |
|---|---|---|
| 1 | `lint` (`eslint .`) | ✅ 0 ошибок, **0 warning'ов** (проверено отдельно `npx eslint src --format=compact`) |
| 2 | `typecheck` (`tsc --noEmit`) | ✅ |
| 3 | `prisma:validate` | ✅ `The schemas at prisma\schema are valid` |
| 4 | `prisma:generate` | ⚠️ **`EPERM: operation not permitted, rename '…\node_modules\.prisma\client\query_engine-windows.dll.node.tmp18356'`** — воспроизвелось дважды. **Причина установлена: на `:3000` работает dev-сервер** (`curl http://localhost:3000/api/openapi` → `200`), он держит `query_engine-windows.dll.node`, и Windows не даёт переименовать файл поверх. **Это окружение, не код** — за находку не выдаю. Из-за `&&`-цепочки шаги 5–15 в общем прогоне не выполнились, поэтому прогнаны поштучно (ниже). Практический вывод: `npm run check` на Windows нельзя прогонять с поднятым `npm run dev` — стоит либо задокументировать это, либо сделать шаг устойчивым. |
| 5 | `openapi:generate` | ✅ |
| 6 | `check:encoding` | ✅ |
| 7 | `check:mojibake` | ✅ |
| 8 | `check:ui-text` | ✅ `UI text hardcode check passed` |
| 9 | `check:context-freshness` | ✅ `snapshot is 0 day(s) old` |
| 10 | `check:openapi-routes` | ✅ `81/288 documented, 218 allowlisted, 0 undocumented` |
| 11 | `check:schema-drift` | ✅ расхождений нет |
| 12 | `check:migration-drops` | ✅ 30 миграций, незаявленных дропов нет |
| 13 | `check:include-where` | ✅ (baseline: 38 unbounded include в 23 файлах — информационно) |
| 14 | `check:worker-boot` | ✅ |
| 15 | `smoke` | ✅ `smoke: ok` |

**Вывод по гейтам:** код-находок из автогейтов нет. Ни один из 15 шагов не ловит ни одну находку этого отчёта — что само по себе находка (см. UI-16).

**Побочный эффект прогона (к сведению владельца).** Шаг `openapi:generate` пишет `openapi/openapi.json` (`scripts/generate-openapi.mjs:5,42-43`). Этот путь **никогда не коммитился** (`git log -- openapi/` пуст) и **не входит в `.gitignore`** (`git check-ignore` → exit 1), т.е. после любого `npm run check` в рабочем дереве появляется untracked-артефакт на 331 КБ, который уедет в коммит при `git add .`. Файл оставлен на месте (удалять чужой untracked-вывод при четырёх параллельных аудитах рискованнее); рекомендация — добавить `openapi/` в `.gitignore`. Сам этот отчёт в git не виден: `docs/*` игнорируется (`.gitignore:62`) — как и прочие audit-деливераблы проекта.

### Второй инструмент: структурный обход JSX
Для доступности grep недостаточен (нужно знать, что у кнопки *в теле*). Прогнан скобко- и кавычко-чувствительный парсер открывающих тегов с сопоставлением закрывающих по всем **830** `.tsx` в `src/` (без `*.test.*`): вычислялось доступное имя каждого интерактивного элемента, состав тела кнопок, наличие `htmlFor`-связи у полей, дерево лендмарков. Каждая находка ниже подтверждена цитатой.

### Поведенческий уровень, не файловый
Для позиционирования оверлеев (`docs/QUALITY-GATES.md` §modal-positioning) прослежена реальная цепочка предков, а не импорты. Для лайтбокса `portfolio-editor.tsx:241`: `portfolio-section.tsx:21` → `SectionCard` (`section-card.tsx:13` — `rounded-2xl border bg-bg-card p-4`) → `studio-settings-page.tsx:47-56` (`grid`/`space-y`) → `AppShellContent` (`app-shell-content.tsx:24-27` — `w-full`) → root layout. Ни `transform`, ни `filter`, ни `backdrop-filter`, ни `contain`, ни `will-change` — containing block **не создаётся**, позиционного дефекта сейчас нет. Отдельно проверен `TopbarShell` (`topbar-shell.tsx:28` — `sticky top-0 z-30 backdrop-blur-md`): он создаёт и stacking context, и containing block, но лайтбоксу он не предок — а вот меню топбара его потомки, откуда UI-14.

### Основные grep'ы
`#hex|rgb()` в `*.tsx|*.ts` (149 попаданий) · `fixed inset-0` (14) · `z-*` (полный инвентарь) · light-only утилиты (`bg-white` 53, `bg-gray-*` 0, `text-zinc-*` 0) · `useReducedMotion|prefers-reduced-motion` (60 файлов) · `duration:`/`ease:` в framer-motion · `<button` (204) / `<input|select|textarea` (63) · `type="checkbox"` (14) · `alt=`/`aria-label`/`outline-none` · `min-w-[Npx]`/`w-[Npx]` · `env(safe-area-inset-*)` · `toLocale*`/`Intl.*` · `UI_TEXT` (8039 строк, выборка по 12 доменам).

### Сводка находок
**36 находок:** P0 — 0 · **P1 — 6** (UI-01…05, UI-30) · **P2 — 21** (UI-06…22, UI-31…34) · **P3 — 9** (UI-23…29, UI-35, UI-36).

---

## Нарушения по категориям (счётчики + файлы)

### A. Мёртвые классы — разметка есть, стиля нет (**подтверждено компиляцией**)

| Класс | Сайтов | Где | Что потеряно |
|---|---|---|---|
| `lux-card` | **23** | `components/ui/card.tsx:8` (**shared Card**), `faq-accordion.tsx:15`, `billing-page.tsx:195,425,429`, `app/blog/page.tsx:32,47`, `app/gift-cards/page.tsx:23`, `app/support/support-client.tsx:224,339`, `app/(cabinet)/cabinet/billing/page.tsx:78`, скелетоны, публичный профиль (`portfolio-strip.tsx:79`, `services-menu.tsx:22`, `booking-section-client.tsx:74`), `studio-profile-form.tsx:154`, … | `border: 1px`, `box-shadow: var(--shadow-card)`, hover-elevation |
| `lux-input` | **4** | `components/ui/input.tsx:10`, `select.tsx:10`, `textarea.tsx:11` (**все три shared-примитива**), `studio-profile-form.tsx:204` | `bg-input`, `border: 1px`, hover-border, `:focus-visible` фон/бордер/ring |
| опасити не кратные 5 (`/4 /6 /8 /12 /2 /3`) | **68** | список в UI-02 | заливка/градиент не рисуется вообще |
| `text-muted-foreground` | **33** | `components/ui/badge.tsx:15` (**variant `muted`**), `catalog-map.tsx` ×7, `catalog-map-sidebar.tsx` ×6, `models/[code]/page.tsx` ×3, … | цвет текста |
| `bg-bg-muted` (+`/20 /30 /40 /50 /60 /70`) | **33** | `u/[username]/booking/loading.tsx` ×17, весь `public-studio/studio-booking-flow/*` ×15, `histogram-slider.tsx` | фон чипов/скелетонов/кнопки |
| `fade-in-up` | **13** | `public-profile/master/sections/*.tsx` ×5, `public-studio/sections/*.tsx` ×8 | анимация появления секций |
| `bg-bg-elevated` (+`/60`) | **6** | `components/billing/PaywallCard.tsx:26,52`, `layout/footer/FooterCTA.tsx:82`, `billing-page.tsx:238`, `slot-picker.tsx`, `profile-media-editor.tsx` | фон |
| `pt-safe` / `pb-safe` | **5** | `layout/cookie-notice.tsx:61`, `app/offline/page.tsx:9`, `pwa/update-prompt.tsx:58`, `ui/network-banner.tsx:23` | safe-area-отступ |
| `glass-panel` | **2** | `cabinet/layout/cabinet-sidebar.tsx:124`, `studio-cabinet/components/studio-navbar.tsx:73` | фон/бордер/blur панели |
| `text-primary-foreground` | **2** | `notifications-center-page.tsx:69,75` | цвет текста на активном чипе |
| `histogram-slider-thumb` | **2** | `catalog/components/histogram-slider.tsx:113,124` | стиль ползунка |
| `border-bg-main` | **1** | `studio-cabinet/settings/components/profile-media-editor.tsx:307` | бордер |

**Итого: 192 сайта мёртвых классов.**

### B. Инлайновые цвета — 149 попаданий, классификация

| Класс | Кол-во | Вердикт |
|---|---|---|
| Определения токенов в `globals.css` / `tailwind.config.js` | — | ✅ оправдано (это и есть источник) |
| Бренд-цвета сторонних сервисов (`#2AABEE` TG, `#0077FF` VK, `#FC3F1D` Яндекс) | 12 | ✅ оправдано — фирменные цвета провайдеров |
| `text-[rgb(var(--accent-foreground))]` (button/chip/slot-picker/CTA) | 6 | ⚠️ **симптом**: обходной путь вокруг отсутствующего моста `accent-foreground` (UI-06) |
| Яндекс-Карты styler'ы (`catalog-map.tsx:105-152`) | 12 | ✅ оправдано — API карт не принимает CSS-переменные |
| Canvas / OG / e-mail — **чужая палитра** | **~90** | ❌ **нарушение**, см. UI-04 |
| `rgba(255,255,255,.x)` поверх фиксированно-тёмных поверхностей | ~20 | ✅ оправдано (пейн логина, бренд-градиент) |
| `rgba(114,8,8,0.45)` в `booking-card-week.tsx:67` | 1 | ⚠️ бренд-цвет захардкожен вместо `shadow-brand` |

### C. Компоненты

| Проверка | Результат |
|---|---|
| Сырых `<button>` | **204** (в т.ч. 6 в `studio-package-flow.tsx`, 6 в `stories-viewer-overlay.tsx`, 5 в `schedule-header.tsx`) |
| Сырых `<input>/<select>/<textarea>` | **63** |
| `type="checkbox"` без общего компонента | **14** — компонента `Checkbox` в `src/components/ui/` **нет** (`ls` подтверждает), хотя SKILL.md его предписывает |
| `type="radio"` | 0 |
| Компонента `Alert` | **отсутствует**, хотя SKILL.md предписывает `<Alert variant="info\|success\|warning\|danger">` |
| `<img>` вне `next/image` | 12, из них 5 с явным обоснованием в комментарии (chat-attachment, OG-роут) |
| Расхождение имён вариантов SKILL ↔ код | `Button`: skill `default\|secondary\|ghost\|outline\|destructive` ↔ код `primary\|secondary\|ghost\|danger\|icon\|wrapper\|inverted`; `Badge`: skill `default\|primary\|success\|warning\|danger\|cool\|hot` ↔ код `default\|success\|warning\|danger\|info\|muted` |

### D. Тёмная тема

| Проверка | Результат |
|---|---|
| `bg-gray-*`, `text-gray-*`, `text-black`, `bg-zinc-*`, `text-zinc-*` | **0** — light-only серых утилит в проекте нет |
| `bg-slate-*` / `text-slate-*` | 4 / 3 — статус-индикаторы, санкционировано SKILL.md |
| `bg-white` | 53, из них **48 — альфа-оверлеи на фиксированно-тёмных бренд-поверхностях** (оправдано), 2 — QR-подложка с явным `dark:bg-white` (оправдано), **3 — мёртвые** (`bg-white/4 /6 /8`, см. UI-02) |
| ad-hoc `dark:`-оверрайды | **548**: master 167, studio 142, admin 83, app 23, `components/ui` 20, client 17, home 9, catalog 4, booking 3, **`components/layout` — 0** |

`components/layout` на нулевом ad-hoc — эталон. Кабинеты master/studio/admin несут 392 из 548 (72 %) — там дрейф.

### E. Моушен

| Метрика | Значение |
|---|---|
| Easing'ов в обиходе | **8**: `[0.22,1,0.36,1]`×18 (канон SKILL.md), `[0.25,0.1,0.25,1]`×15, `"easeInOut"`×4, `"easeOut"`×3, `[0.4,0,0.2,1]`×2, `[0.25,0.46,0.45,0.94]`×2, `[0.4,0,1,1]`×1, `"linear"`×1 |
| Длительностей framer | **20 разных** значений 0.14–0.5 (+`1.15` для бесконечного sweep'а OTP) |
| Длительностей Tailwind `duration-*` | 5: `200`×26, `300`×18, `150`×4, `500`×3, `700`×1 |
| Дистанций `y:` | 12 разных: `-8 -6 -4 4 6 8 10 12 14 16 18 20 24 80` |
| hover-подъём | 7 вариантов: `scale-105`×4, `scale-[1.04]`×3, `scale-[1.03]`×3, `-translate-y-0.5`×2, `scale-110`×1, `-translate-y-1`×1 |
| press | 3 варианта: `active:scale-95`×2, `active:scale-[0.99]`×1, `active:scale-[0.98]`×1 |
| `AnimatePresence` | ✅ **31 файл; ни одного `exit=` без `AnimatePresence` в том же файле** — мёртвых exit-анимаций нет |
| reduced-motion | ✅ 60 файлов с `useReducedMotion`; **все бесконечные CSS-циклы (aurora ×5, sheen, spark, pulse-dot, shimmer, halo, plate-drift, marquee ×2) закрыты `@media (prefers-reduced-motion: no-preference)`** — `globals.css:542-561`. OTP-sweep гейтится через `!reduce` (`otp-input.tsx:263`) |
| **Не закрыто reduced-motion** | `globals.css:231` `html { scroll-behavior: smooth; }` — см. UI-11 |

### F. Типографика

`text-[10px]` ×261, `text-[11px]` ×204, `text-[9px]` ×25, `text-[10.5px]` ×6 — **496 сайтов ниже нижней ступени шкалы** (SKILL.md: `mono 13`, `small 14`). Токена < 12px в системе нет, поэтому каждый сайт изобретает свой.
`rounded-[24px]`×12, `[28px]`×7, `[20px]`×7, `[16px]`×4, `[22px]`×3, `[32px]`×2, `[26px]`×2 — 7 радиусов вне шкалы `lg/xl/2xl`.

### G. Мобилка

| Проверка | Результат |
|---|---|
| `env(safe-area-inset-bottom)` на нижних fixed | ✅ покрыты: `bottom-nav.tsx:175,327`, `master-bottom-nav.tsx:98,150`, `studio-bottom-nav.tsx:124,182`, `cabinet-bottom-nav.tsx:31`, `mobile-booking-cta.tsx:22`, `sticky-cta-section.tsx:22`, `drawer.tsx:278` |
| **НЕ покрыт** | `layout/cookie-notice.tsx:61` — `pb-safe` мёртвый (UI-08) |
| CSS-переменные `--safe-area-inset-*` (`globals.css:225-228`) | **0 потребителей** — мёртвый код |
| Таблицы в скролл-контейнере | ✅ `payments-tab.tsx:198`, `bookings-table.tsx:31`, `clients-table.tsx:34`, `subscriptions-table.tsx` — `overflow-x-auto` + `min-w-[860/920px]` |
| Таблицы без `min-w` | `users-table.tsx:129`, `cities-table.tsx:239`, `catalog-table.tsx:173` — `w-full` без min-w (сжимаются, не переполняют) |
| Тач-таргеты | `Button size="icon"` = `h-10 w-10` (40px) — минимум пройден, до 44px (Apple HIG / WCAG 2.5.5) не дотягивает; `size="sm"` = `h-9` (36px) |

### H. Доступность

Структурный обход всех 830 `.tsx` в `src/` (без `*.test.*`), парсинг открывающих тегов с сопоставлением закрывающих.

| Проверка | Результат |
|---|---|
| Иконочные кнопки без доступного имени | ✅ **0 из 82** — все несут `aria-label` / `aria-labelledby` / `title` / `sr-only`. Категория чистая. |
| `<Image>` / `<img>` вообще без `alt` | ✅ **0**. `ResilientImage` типизирует `alt` как обязательный (`resilient-image.tsx:117` вызывает `alt.trim()`). |
| `alt=""` на контентных изображениях | ⚠️ **~45 из 48** (20 фото/сториз/вложений + 26 аватаров); честно декоративных — 3 |
| `aria-hidden` на интерактивных элементах | ✅ **0** — проверены все `button/Button/a/Link/input/Input/select/Select/textarea/Textarea` |
| Подавленный focus-ring без замены | ⚠️ **7** (1 кнопка + 6 полей); из 74 `outline-none` остальные закрыты либо вариантом, либо базовым правилом `globals.css:217-221` |
| Сырые поля без программной связи с меткой | ⚠️ **20** (11 видимых + 9 скрытых file-input) |
| Лендмарки `<main>` | ⚠️ **дубль на всех аутентифицированных маршрутах** (см. UI-30) |
| `<nav>` без `aria-label` | ⚠️ 5 из 8 глобальных навигаций |
| Focus-trap / return-focus в `ModalSurface` / `Drawer` | ✅ инвариант #27 держится в примитивах (`modal-surface.tsx:141-143`, `drawer.tsx:150-152`); исключения — UI-13 |

---

## Таблица контраста с вычислениями

Формула WCAG 2.1: `L = 0.2126·R' + 0.7152·G' + 0.0722·B'`, где `C' = C/255 ≤ 0.03928 ? C/12.92 : ((C/255+0.055)/1.055)^2.4`; `ratio = (L_светлее + 0.05) / (L_темнее + 0.05)`. Порог AA: **4.5:1** обычный текст, **3:1** крупный (≥18px или ≥14px bold) и не-текстовые границы (1.4.11).

### Относительная яркость токенов

**Светлая тема:** `bg-page #F6F0EA` L=0.87854 · `bg-card #FFFCF8` L=0.97658 · `bg-input #FAF6F0` L=0.92527 · `text-main #2A0A10` L=0.00747 · `text-label #56262E` L=0.03562 · `text-sec #876770` L=0.16021 · `text-placeholder #B89AA0` L=0.35840 · `primary #720808` L=0.03769 · `primary-magenta #D44A6A` L=0.19935 · `success #1F7A4D` L=0.14746 · `warning #B45309` L=0.15910 · `destructive #B00020` L=0.09334 · `border-subtle #E0D0C8` L=0.65129

**Тёмная тема:** `bg-page #1F1417` L=0.00853 · `bg-card #302026` L=0.01801 · `bg-input #1F080B` L=0.00489 · `text-main #FDF2F0` L=0.90678 · `text-label #DCB8C0` L=0.53302 · `text-sec #C79BA2` L=0.38193 · `text-placeholder #876770` L=0.16021 · `primary #7A102C` L=0.04690 · `accent-text #C6A97E` L=0.41888 · `primary-magenta #BE4868` L=0.16581 · `primary-foreground #EDE3E4` L=0.78544 · `success #34A863` L=0.29636 · `warning #D97706` L=0.27959 · `destructive #DC2626` L=0.16742 · `border-subtle #5A1820` L=0.02931

### Результаты

| Пара | Light hex | Light | AA | Dark hex | Dark | AA |
|---|---|---|---|---|---|---|
| text-main / bg-page | `#2A0A10`/`#F6F0EA` | 16.16 | ✅ | `#FDF2F0`/`#1F1417` | 16.35 | ✅ |
| text-main / bg-card | `#2A0A10`/`#FFFCF8` | 17.86 | ✅ | `#FDF2F0`/`#302026` | 14.07 | ✅ |
| text-label / bg-card | `#56262E`/`#FFFCF8` | 11.99 | ✅ | `#DCB8C0`/`#302026` | 8.57 | ✅ |
| **text-sec / bg-page** | `#876770`/`#F6F0EA` | **4.42** | ❌ **AA-large only** | `#C79BA2`/`#1F1417` | 7.38 | ✅ |
| text-sec / bg-card | `#876770`/`#FFFCF8` | 4.88 | ✅ | `#C79BA2`/`#302026` | 6.35 | ✅ |
| text-sec / bg-input | `#876770`/`#FAF6F0` | 4.64 | ✅ | `#C79BA2`/`#1F080B` | 7.87 | ✅ |
| **text-placeholder / bg-input** | `#B89AA0`/`#FAF6F0` | **2.39** | ❌ **FAIL** | `#876770`/`#1F080B` | **3.83** | ❌ (AA-large only) |
| **text-placeholder / bg-card** | `#B89AA0`/`#FFFCF8` | **2.51** | ❌ **FAIL** | `#876770`/`#302026` | **3.09** | ❌ (AA-large only) |
| accent-text / bg-card | `#720808`/`#FFFCF8` | 11.71 | ✅ | `#C6A97E`/`#302026` | 6.89 | ✅ |
| accent-text / bg-page | `#720808`/`#F6F0EA` | 10.59 | ✅ | `#C6A97E`/`#1F1417` | 8.01 | ✅ |
| **primary (как ТЕКСТ) / bg-card** | `#720808`/`#FFFCF8` | 11.71 | ✅ | `#7A102C`/`#302026` | **1.42** | ❌ **FAIL** |
| **primary (как ТЕКСТ) / bg-page** | `#720808`/`#F6F0EA` | 10.59 | ✅ | `#7A102C`/`#1F1417` | **1.66** | ❌ **FAIL** |
| primary-fg / primary (заливка) | `#FFFFFF`/`#720808` | 11.97 | ✅ | `#EDE3E4`/`#7A102C` | 8.62 | ✅ |
| primary-fg / primary-hover | `#FFFFFF`/`#A10728` | 8.15 | ✅ | `#EDE3E4`/`#9E1E3E` | 6.17 | ✅ |
| **primary-fg / primary-magenta** (правый край CTA-градиента) | `#FFFFFF`/`#D44A6A` | **4.21** | ❌ **AA-large only** | `#EDE3E4`/`#BE4868` | **3.87** | ❌ **AA-large only** |
| primary-fg / brand-from | `#FFFFFF`/`#720808` | 11.97 | ✅ | `#EDE3E4`/`#720808` | 9.53 | ✅ |
| primary-fg / brand-via | `#FFFFFF`/`#A10728` | 8.15 | ✅ | `#EDE3E4`/`#A10728` | 6.49 | ✅ |
| success / bg-card | `#1F7A4D`/`#FFFCF8` | 5.20 | ✅ | `#34A863`/`#302026` | 5.09 | ✅ |
| warning / bg-card | `#B45309`/`#FFFCF8` | 4.91 | ✅ | `#D97706`/`#302026` | 4.85 | ✅ |
| **destructive / bg-card** | `#B00020`/`#FFFCF8` | 7.16 | ✅ | `#DC2626`/`#302026` | **3.20** | ❌ **AA-large only** |
| warning / bg-page | `#B45309`/`#F6F0EA` | **4.44** | ❌ **AA-large only** | `#D97706`/`#1F1417` | 5.63 | ✅ |
| **destructive / bg-page** | `#B00020`/`#F6F0EA` | 6.48 | ✅ | `#DC2626`/`#1F1417` | **3.71** | ❌ **AA-large only** |
| **border-subtle / bg-card** (1.4.11, порог 3:1) | `#E0D0C8`/`#FFFCF8` | **1.46** | ❌ **FAIL** | `#5A1820`/`#302026` | **1.17** | ❌ **FAIL** |
| **border-subtle / bg-page** (1.4.11) | `#E0D0C8`/`#F6F0EA` | **1.32** | ❌ **FAIL** | `#5A1820`/`#1F1417` | **1.35** | ❌ **FAIL** |
| **bg-input / bg-card** (граница поля, 1.4.11) | `#FAF6F0`/`#FFFCF8` | **1.05** | ❌ **FAIL** | `#1F080B`/`#302026` | **1.24** | ❌ **FAIL** |
| brand-accent / brand-pane (пейн логина) | `#C6A97E`/`#3A040C` | 7.80 | ✅ | тот же | 7.80 | ✅ |

**Провалов: 9 пар** (из них 3 — на основных читаемых поверхностях: placeholder, text-sec на bg-page, text-primary в тёмной).

---

## Предлагаемый канонический набор моушена

Выведен из того, что уже доминирует, + SKILL.md §9. Цель — свести 8 easing'ов / 20 длительностей к **3 переходам**.

```ts
// src/lib/ui/motion.ts (предлагается — сейчас такого модуля нет)
export const EASE = [0.22, 1, 0.36, 1] as const;          // единственный easing (уже 18 сайтов, канон SKILL.md)
export const EASE_EXIT = [0.4, 0, 1, 1] as const;          // только для ухода/сворачивания (уже login-client.tsx:100)

export const MOTION = {
  /** Микро: чипы, дропдауны, тултипы, оверлей модалки. */
  micro:   { duration: 0.18, ease: EASE },                 // сейчас: 0.14/0.15/0.16/0.18/0.2 → одно значение
  /** Стандарт: панель модалки, drawer, смена шага, вход карточки. */
  base:    { duration: 0.28, ease: EASE },                 // сейчас: 0.22/0.24/0.25/0.28/0.3/0.32 → одно значение
  /** Секция: whileInView-появление блока лендинга/профиля. */
  section: { duration: 0.45, ease: EASE },                 // сейчас: 0.35/0.36/0.38/0.4/0.45/0.5 → одно значение
  stagger: 0.08,
} as const;

export const DISTANCE = { rise: 16, nudge: 6 } as const;   // сейчас 12 значений y: → два
export const HOVER = { y: -2 } as const;                   // SKILL.md §9; сейчас 7 вариантов
export const PRESS = { scale: 0.97 } as const;             // SKILL.md §9; сейчас 3 варианта
```

Tailwind-эквиваленты: `duration-200` (micro+base) и `duration-500` (section); `duration-300`/`150`/`700` вывести.
Правило употребления: `duration: reduce ? 0 : MOTION.base.duration` — паттерн уже принят в 60 файлах, его и держать.

**Что НЕ трогать:** `stories-viewer-overlay.tsx:151` (`ease:"linear"` — прогресс-бар сториз, линейность содержательна) и `otp-input.tsx:272` (`1.15s` infinite sweep — гейтится `!reduce`).

---

## Инвентарь z-index

| Значение | Кол-во | Кто |
|---|---|---|
| `z-[1]` | 5 | декоративные слои |
| `z-[2]` | 2 | `otp-input.tsx` sweep |
| `z-[5]` | 1 | активный маркер карты |
| `z-10` | 28 | локальные наложения, invisible click-catcher'ы, sticky-колонки таблиц |
| `z-20` | 20 | sticky page-header'ы кабинетов |
| `z-30` | 11 | **`topbar-shell.tsx:28`** (`sticky top-0 z-30 backdrop-blur-md`), `mobile-booking-cta.tsx:21` |
| `z-40` | 8 | нижние навигации (`bottom-nav.tsx:326`, `cabinet-bottom-nav.tsx:27`, `master-bottom-nav.tsx:149`, `studio-bottom-nav.tsx:181`), `drawer.tsx:201` backdrop |
| `z-[45]` | 1 | `cookie-notice.tsx:61` |
| `z-[46]` | 1 | `pwa/install-prompt.tsx:120` |
| `z-[49]` | 3 | скримы мобильных навигаций |
| `z-50` | 14 | `modal-surface.tsx:158`, `stories-viewer-overlay.tsx:192`, `admin-sidebar-mobile.tsx:47`, `portfolio-editor.tsx:241`, листы нижних навигаций |
| `z-[100]` | 2 | `auth-user-menu.tsx:94`, `auth-mobile-menu.tsx:161` |
| `z-[9999]` | 2 | `booking-card-actions-menu.tsx:227`, `schedule-settings/hours/day-action-menu.tsx:126` |

**Диагноз — «гонка вооружений» с двумя реальными дефектами:**

1. **`z-[100]` внутри `z-30` бессмысленен.** `TopbarShell` (`src/components/layout/topbar-shell.tsx:28`) — `sticky top-0 z-30` — это **позиционированный элемент с z-index**, т.е. он создаёт stacking context. `AuthUserMenu`/`AuthMobileMenu` рендерятся его потомками (`topbar.tsx:221,227,238`) с `absolute … z-[100]`, поэтому глобально они всё равно на уровне **z-30** и уходят ПОД `z-40` (нижняя навигация), `z-[45]` (cookie), `z-[46]` (PWA-промпт), `z-[49]`, `z-50`. Число 100 создаёт ложное ощущение приоритета.
2. **`z-[9999]` у двух контекст-меню** — на 199 больше, чем у любой модалки; меню всплывёт поверх открытого диалога.

Порядок между `z-[45]` (cookie), `z-[46]` (PWA) и `z-40` (нижняя навигация) при этом **осмысленный и намеренный** — их лучше не трогать, а формализовать (см. план фиксов, FIX-05-07).

---

## Находки

### P0 🔴 — блокеры запуска

Не выявлено. Все находки — визуально-деградационные или a11y, продукт функционирует.

---

### P1 🟠 — чинить до запуска

---

**UI-01 · Правила `.lux-card` / `.lux-input` удалены из CSS, а 27 сайтов (включая все shared-примитивы) на них ссылаются**
**Трудоёмкость: S**

`src/components/ui/card.tsx:8`
```tsx
"lux-card rounded-[24px] bg-bg-card",
```
`src/components/ui/input.tsx:10`, `src/components/ui/select.tsx:10`, `src/components/ui/textarea.tsx:11`
```tsx
"lux-input h-11 w-full rounded-2xl px-4 text-sm text-text-main placeholder:text-text-placeholder outline-none",
```

**Доказательство.** `grep -rn "lux-" src --include="*.css"` → **0 определений**; единственный CSS-файл проекта — `src/app/globals.css` (`find src -name "*.css"`). Компиляция зонда (`npx tailwindcss` + боевой конфиг) не порождает ни `.lux-card`, ни `.lux-input`.

Правила существовали и были снесены в `68c17f9` «redesign login pane» (2026-04-27, `globals.css` −526 строк). `git show 68c17f9 -- src/app/globals.css`:
```css
-  .lux-card {
-    background-color: rgb(var(--bg-card));
-    border: 1px solid rgb(var(--border-subtle) / 0.9);
-    box-shadow: var(--shadow-card);
-    transition: border-color 240ms ease, box-shadow 240ms ease, transform 240ms ease;
-  }
-  .lux-card:hover { border-color: rgb(var(--border-subtle) / 1); box-shadow: var(--shadow-hover); }
-  .lux-input {
-    background-color: rgb(var(--bg-input));
-    border: 1px solid rgb(var(--border-subtle) / 0.68);
-    transition: border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease;
-  }
-  .lux-input:hover { border-color: rgb(var(--border-subtle)); }
-  .lux-input:focus-visible {
-    background-color: rgb(var(--bg-input-focus));
-    border-color: rgb(var(--border-focus));
-    box-shadow: 0 0 0 1px rgb(var(--border-focus) / 0.34), 0 0 0 7px rgb(var(--border-focus) / 0.16);
-  }
```

**Импакт.**
- **Поля ввода не имеют рамки вообще.** Tailwind preflight ставит `border-width: 0` на всё (`.tmp` компиляция, строка 123 вывода: `*,::before,::after { border-width: 0; border-style: solid; }`). Базовое правило `globals.css:211-215` задаёт полю `border-color`, но **не `border-width`** — значит рамки нет. Единственное, что отличает поле от карточки, — заливка `--bg-input` vs `--bg-card`, а это **1.05:1** в светлой теме (см. таблицу контраста) → поле физически неразличимо. **Провал WCAG 1.4.11.**
- Задето **119 файлов**, импортирующих `Input`/`Select`/`Textarea`, в том числе **`/login`** (`src/app/login/login-client.tsx:560,583` — `<Input className="h-[52px] rounded-2xl pl-10 pr-4 text-base" />`, своей рамки не добавляет). Это production-вход: в проде включён именно e-mail-OTP (`PHONE_AUTH_ENABLED` off), т.е. первое поле, которое видит боевой пользователь.
- `Card` (19 импортёров) потерял рамку, тень и hover-элевацию → карточки читаются как плоские цветные прямоугольники.
- Фокус частично спасён: `globals.css:217-221` даёт `input:focus` box-shadow-кольцо (`border-color` там тоже не сработает). То есть **фокус видно, покой — нет**.

**Направление фикса.** Вернуть три правила в `@layer components` в `globals.css` (дословно из `68c17f9`) — это восстанавливает все 27 сайтов одним изменением и ничего не ломает. Долгосрочно — перенести стили внутрь компонентов (`border border-border-subtle bg-bg-input …`), чтобы «класс без правила» стал невозможен, и параллельно поднять `--border-subtle` до 3:1 (UI-09).

---

**UI-02 · 68 классов прозрачности не кратны 5 → заливка не рисуется**
**Трудоёмкость: S**

Шкала `opacity` в Tailwind v3.4.17 — только кратные 5 (проверено: `Object.keys(require("tailwindcss/defaultTheme").opacity)` → `0,5,10,15,…,100`). Всё остальное требует скобок (`/[0.12]`).

**Доказательство (компиляция зонда с боевым конфигом):**
```
probe: "bg-primary/12 bg-primary/8 bg-primary/10 bg-primary-magenta/8 bg-emerald-500/12 from-primary/8 bg-brand-accent/12 via-purple-500/3 bg-primary/[0.12]"
→ сгенерировано ровно 2 правила:
   .bg-primary\/10 { … }
   .bg-primary\/\[0\.12\] { … }
```
`bg-primary/12`, `bg-primary/8`, `bg-primary-magenta/8`, `bg-emerald-500/12`, `from-primary/8`, `bg-brand-accent/12`, `via-purple-500/3` — **правил нет**.

**68 сайтов** (полный список — `grep -rnoE '\b(bg|text|border|ring|from|via|to)-[a-zA-Z0-9-]+/[0-9]{1,3}\b' src --include="*.tsx" --include="*.ts" | awk -F'/' '$NF%5!=0'`). Самое видимое:

| Поверхность | file:line | Что не рисуется |
|---|---|---|
| Статусы платежей в админке | `src/features/admin-cabinet/billing/lib/payment-status.ts:35-39` | `bg-emerald-500/12` / `bg-amber-500/12` / `bg-red-500/12` / `bg-primary/12` — **все четыре пилюли статуса без фона** |
| Статусы каталога (админ) | `src/features/admin-cabinet/catalog/components/catalog-status-pill.tsx:15,17,19` | все три |
| Роли и планы пользователей | `src/features/admin-cabinet/users/components/user-role-badge.tsx:18-20`, `user-plan-pill.tsx:14-15` | все |
| KPI-дельты дашборда | `src/features/admin-cabinet/dashboard/components/kpi-card.tsx:87,88` | рост/падение |
| Подписки | `src/features/admin-cabinet/billing/components/subscriptions-tab/subscriptions-row.tsx:24,25,94` | |
| Ауры hero (6 маркетинговых страниц) | `app/pricing/page.tsx:56,60` · `app/help/page.tsx:41,45` · `app/careers/page.tsx:21,25` · `app/support/page.tsx:60,64` · `features/home/components/hero-section.tsx:71,75` · `features/marketing/sections/hero-section.tsx:51,55` · `features/model-offers/components/compact-hero.tsx:26,30` | вся фоновая подсветка |
| 404 | `src/app/not-found.tsx:33,37` | обе орбиты |
| Visual Search модал | `src/features/home/components/visual-search-modal.tsx:149,255,294` | AI-акценты + ошибка |
| Trial-промо | `src/features/pricing/components/trial-promo-block.tsx:22` | `from-primary/8 to-primary-magenta/8` — весь градиент |
| Интеграции кабинета | `telegram-notifications.tsx:74,86` · `vk-notifications.tsx:94,107` · `hot-slots-settings-section.tsx:123,131,146,269` · `public-username-card.tsx:120` · `studio-profile-form.tsx:38` | `bg-white/4 /6 /8` — подложки карточек |

**Направление фикса.** Механическая замена на ближайшее кратное 5 (`/8`→`/10`, `/12`→`/10` или `/15`, `/4`→`/5`, `/6`→`/5`, `/2`,`/3`→`/5`) либо на скобочную форму (`/[0.08]`). Плюс — гейт (UI-16), иначе класс вернётся.

---

**UI-03 · `bg-bg-muted` не существует → гостевой booking-флоу студии и скелетон страницы записи рендерятся пустыми**
**Трудоёмкость: S**

В `tailwind.config.js` ключ называется `muted` (строка 42: `muted: "rgb(var(--muted) / <alpha-value>)"`), т.е. валидный класс — `bg-muted`. `bg-bg-muted` не порождает правила (подтверждено зондом: `.bg-muted` есть, `.bg-bg-muted` нет).

**33 сайта**, из них 32 — на двух конверсионных поверхностях:

- `src/app/(public)/u/[username]/booking/loading.tsx` — **17 сайтов**, весь скелетон страницы записи:
  ```tsx
  7:  <div className="h-28 animate-pulse bg-bg-muted/60 sm:h-32" />
  12: <div className="h-6 w-48 animate-pulse rounded bg-bg-muted/60" />
  ```
  `animate-pulse` на прозрачном элементе — пульсирует ничто. **Загрузка страницы записи выглядит как пустой экран.**
- `src/features/public-studio/studio-booking-flow/*` — **15 сайтов**, в т.ч.:
  - `booking-flow.tsx:553` — CTA финального экрана: `<a className="mt-5 inline-flex rounded-xl bg-bg-muted px-4 py-2 …">{UI_TEXT.bookingWidget.success.backToStudio}</a>` → кнопка без фона, читается как обычный текст;
  - `components/steps-bar.tsx:48` — `"bg-bg-muted text-text-muted"` для непройденных шагов → индикатор прогресса теряет невыполненные шаги;
  - `components/booking-summary.tsx:43` — бейдж «не готово» без фона;
  - `booking-flow.tsx:718-722`, `steps/when-step.tsx:182` — скелетоны слотов;
  - `steps/master-step.tsx:53`, `steps/service-step.tsx:130,141`, `when-step.tsx:186`, `booking-hero.tsx:116`, `you-step.tsx:121`, `booking-flow.tsx:759`.
- `src/features/catalog/components/histogram-slider.tsx` — комментарий на строке 29 прямо декларирует «use `bg-bg-muted/40` for a clear "unselected" affordance», а affordance'а нет.

**Направление фикса.** `bg-bg-muted` → `bg-muted` (sed по 33 сайтам). **Корень проблемы — расщеплённое именование в конфиге**: поверхности объявлены как `bg-page`/`bg-card`/`bg-input` (пишется `bg-bg-page`), а `muted`/`elevated`/`surface` — без префикса (пишется `bg-muted`). Именно это породило и `bg-bg-muted`, и `bg-bg-elevated` (UI-07). Привести к одной схеме.

---

**UI-04 · Транзакционная почта, share-картинки, OG-превью и глобальный экран ошибки — в оставленной фиолетово-розовой палитре**
**Трудоёмкость: M**

SKILL.md §1: «НЕ generic-AI-фиолетовый». Палитра проекта — бордо (`--primary: 114 8 8`). Тем не менее:

**1. E-mail — обе живые шаблонки.**
`src/lib/email/templates/otp-code.ts:17`
```html
<td style="background:linear-gradient(135deg,#7c3aed,#ec4899);padding:32px 32px 24px;text-align:center;">
```
`:28-29` — блок с кодом: `background:#f5f3ff;border:2px solid #ede9fe;` и `color:#7c3aed` для самих цифр.
`src/lib/email/templates/notification.ts:23,45,60` — тот же градиент на CTA-кнопке, шапке и ссылке.

Потребители (подтверждено `grep`): `src/app/api/auth/otp/email/request/route.ts:11`, `src/app/api/cabinet/user/profile/email/request-verify/route.ts:14`, `src/lib/notifications/delivery.ts:15`. **E-mail-OTP — единственный включённый канал входа в проде** (`PHONE_AUTH_ENABLED` off по умолчанию, §7 контекста), т.е. **первый брендированный артефакт боевого пользователя — в чужой палитре.**

**2. Share-картинка кабинета (её пользователь скачивает и публикует).**
`src/features/billing/components/public-settings-client.tsx` — ~50 хардкодов на canvas: `#7c3aed` (:59,110,117,135,168,208,214,235,285), `#ec4899` (:111,118,209), `#ede9fe`/`#fce7f3` (:55,56), плюс серые `#111827`/`#6b7280`/`#374151`/`#9ca3af`/`#e5e7eb`/`#f9fafb`. Монтируется на `/cabinet/master/settings/public` и `/cabinet/studio/settings/public`.

**3. Вторая share-картинка — третья палитра.** `src/features/cabinet/components/share-profile-section.tsx:102,107,111` — `#1e1e24` / `#a0a0a0` / `#c6a97e`. То есть два генератора постеров в одном продукте дают два разных не-брендовых оформления.

**4. OG-превью публичного профиля.** `src/app/api/og/profile/route.tsx:12-16`
```ts
const GRADIENT_START = "rgb(198, 169, 126)";
const GRADIENT_END   = "rgb(191, 130, 176)";
const SURFACE_BG     = "rgba(30, 30, 36, 0.92)";
```
Подключено в `src/app/(public)/u/[username]/page.tsx:207`. Это карточка, которую видят в соцсетях и мессенджерах при шаринге любого мастера — бордо там нет.

**5. Глобальный экран ошибки.** `src/app/global-error.tsx:81`
```
.btn-pri{background:linear-gradient(135deg,#8b5cf6,#a855f7,#d946ef);color:#fff}
```
и `:89` `stroke="#8b5cf6"` — ровно тот «generic-AI-фиолетовый», который SKILL.md запрещает. Само по себе автономное встраивание CSS здесь оправдано (`global-error` рендерится при падении root-layout, Tailwind недоступен), **но значения обязаны быть бордовыми**.

**Направление фикса.** Ввести один разделяемый набор бренд-констант для «сред без Tailwind» (`src/lib/ui/brand-colors.ts`: `BRAND_FROM="#720808"`, `BRAND_VIA="#A10728"`, `BRAND_DEEP="#560505"`, `TEXT_ON_BRAND="#FFFFFF"`) и протянуть его в 5 мест. Значения должны совпадать с `--brand-*` в `globals.css:63-65`.

---

**UI-05 · Контраст placeholder'а 2.39:1 в светлой теме — провал WCAG 1.4.3 на каждом поле продукта**
**Трудоёмкость: S**

`src/app/globals.css:17` — `--text-placeholder: 184 154 160; /* #B89AA0 */`, `:10` — `--bg-input: 250 246 240; /* #FAF6F0 */`.

Вычисление: `L(#B89AA0)=0.35840`, `L(#FAF6F0)=0.92527` → `(0.92527+0.05)/(0.35840+0.05) = 0.97527/0.40840 = **2.39**`. На карточке `#FFFCF8` — **2.51**. Порог для обычного текста — 4.5.

Потребители (подтверждено): `globals.css:216` (`input::placeholder, textarea::placeholder`), `components/ui/input.tsx:10`, `components/ui/textarea.tsx:11`, `booking-flow/components/phone-input.tsx:49`, `chat/composer/composer.tsx:306`, `chat/conversation-list/list-header.tsx:49`, `studio-profile-form.tsx:204`. Т.е. **все поля продукта**.

В тёмной теме `#876770` на `#1F080B` = **3.83**, на `#302026` = **3.09** — тоже ниже 4.5.

Отдельно: `service-search-input.tsx:181` и `bookings-toolbar.tsx:75` используют `placeholder:text-text-sec` вместо placeholder-токена — третье поведение.

**Направление фикса.** Осветлить/затемнить токен до ≥4.5: в светлой ориентировочно `#8E7078` (≈4.2 — нужен подбор до 4.5), в тёмной поднять до уровня `text-sec`. Placeholder в этом продукте часто несёт формат (`«+7 999 …»`), т.е. это информативный текст, а не декор.

---

**UI-30 · Два вложенных `<main>` на каждом кабинетном, админском и login-маршруте**
**Трудоёмкость: S**

`src/components/layout/app-shell.tsx:19` — **безусловно**, на каждом маршруте продукта:
```tsx
<main data-testid="app-main" className="flex-1 w-full">
  <AppShellContent>{children}</AppShellContent>
</main>
```
`AppShell` смонтирован в корневом лэйауте (`src/app/layout.tsx:209` — `<AppShell>{children}</AppShell>`), т.е. охватывает всё.

Внутрь него шеллы кладут **второй** `<main>` (полный список `grep -rn "<main" src --include="*.tsx"`):

| file:line | Затронутые маршруты |
|---|---|
| `src/features/master/components/master-cabinet-shell.tsx:105` | все `/cabinet/master/*` |
| `src/app/(cabinet)/cabinet/studio/layout.tsx:92` | все `/cabinet/studio/*` |
| `src/features/cabinet/layout/cabinet-layout.tsx:47` | все `/cabinet/*` (клиент) |
| `src/features/admin-cabinet/components/admin-shell.tsx:49` | все `/admin/*` |
| `src/app/login/login-client.tsx:426` | `/login` |
| `src/app/blog/page.tsx:15`, `src/app/faq/page.tsx:32`, `src/app/gift-cards/page.tsx:13` | три публичные страницы |

**Импакт.** По HTML-спецификации и WCAG 1.3.1 у документа один `main`-лендмарк. Скринридер получает два: навигация по лендмаркам (`D` в NVDA, ротор в VoiceOver) перестаёт быть однозначной ровно на тех поверхностях, где пользователь проводит всё время.

**Проект знает об этом классе — но лечил симптом, а не причину.** `src/features/master/components/profile/master-profile-page.tsx:51-52` документирует уже сделанный точечный фикс:
```
              a landmark — the page's `<main>` is the MasterCabinetShell. Использование
              `<main>` here nested a second `<main>` inside it (invalid landmark).
```
При этом дублирование уровнем выше (AppShell ↔ шеллы кабинетов) осталось. Более того, симптом попал в триггеры QA-скилла — `.claude/skills/playwright-qa/SKILL.md:3` перечисляет «**два main, dual main**» среди поводов обратиться за помощью по локаторам, то есть дубль известен как **неудобство автотестов** и никогда не был квалифицирован как дефект доступности.

**Направление фикса.** `AppShellContent` уже вычисляет ровно нужный признак (`app-shell-content.tsx:20-21`):
```tsx
const isWorkspace = pathname.startsWith("/cabinet") || pathname.startsWith("/admin");
```
но использует его только для ширины. Поднять это решение в `AppShell` (или отдать `main` целиком нижним шеллам) и снять `<main>` в трёх публичных страницах. Закрепить тестом: «в отрендеренном документе ровно один `<main>`» — по образцу guard'ов #35/#36 (структурный инвариант, а не точечная правка).

---

### P2 🟡 — вскоре после запуска

---

**UI-06 · Мостов `muted-foreground`, `primary-foreground`, `accent-foreground`, `card-foreground`, `popover`, `rose`, `sky` в `tailwind.config.js` нет — 35 сайтов компилируются в ничто**
**Трудоёмкость: S**

CSS-переменные объявлены (`globals.css:89` `--muted-foreground`, `:28` `--primary-foreground`, `:95` `--accent-foreground`, `:82` `--card-foreground`, `:83` `--popover`, `:40-41` `--rose`/`--sky`), моста нет. В конфиге `primary` и `muted` — **строки**, а не объекты, поэтому `-foreground`-производные не генерируются (объектом объявлен только `destructive`, `tailwind.config.js:68-71` — он работает).

Зонд подтверждает: из `text-muted-foreground text-primary-foreground text-accent-foreground text-card-foreground bg-popover text-rose text-sky bg-glass-bg` не сгенерировано **ни одного** правила; `shadow-brand`, `bg-success`, `text-destructive`, `text-accent-text`, `bg-brand-pane` — сгенерированы.

- `text-muted-foreground` — **33 сайта**, ключевой: `src/components/ui/badge.tsx:15`
  ```tsx
  muted: "border-border bg-muted text-muted-foreground",
  ```
  → `<Badge variant="muted">` не имеет цвета текста и наследует контекст. Остальные: `catalog-map.tsx` ×7, `catalog-map-sidebar.tsx` ×6, `models/[code]/page.tsx` ×3, `public-model-offer-apply.tsx` ×3, `catalog-page-client.tsx`, `district-suggest-input.tsx`.
- `text-primary-foreground` — `notifications-center-page.tsx:69,75` (активный чип фильтра).
- Ловушка имён: `--rose`/`--sky` объявлены и переопределены в `.dark` (`globals.css:40-41,134-135`), но `rose-*`/`sky-*` в разметке (46 попаданий) резолвятся во **встроенную палитру Tailwind**, а не в токен. Токены-«призраки»: их правка ничего не меняет, а комментарий `globals.css:93` («use `--rose` for pink badges») дезинформирует.

**Направление фикса.** Достроить мост (по образцу `destructive`) либо удалить переменные-сироты. Обходной путь `text-[rgb(var(--accent-foreground))]` в `button.tsx:23`, `chip.tsx:14`, `slot-picker.tsx:235`, `book-client.tsx:172`, `mobile-booking-cta.tsx:28`, `booking-section-client.tsx:62`, `visual-search-modal.tsx:379` после этого можно свернуть в `text-accent-foreground`.

---

**UI-07 · `bg-bg-elevated`, `border-bg-main`, `glass-panel`, `fade-in-up`, `histogram-slider-thumb` — мёртвые классы**
**Трудоёмкость: S**

Все подтверждены компиляцией зонда.

| Класс | Сайты | Импакт |
|---|---|---|
| `bg-bg-elevated` (валидно `bg-elevated`) | `components/billing/PaywallCard.tsx:26,52` · `layout/footer/FooterCTA.tsx:82` · `billing-page.tsx:238` (`/60`) · `slot-picker.tsx` · `profile-media-editor.tsx` | Paywall-карточка и футерный CTA без подложки |
| `glass-panel` | `cabinet/layout/cabinet-sidebar.tsx:124` · `studio-cabinet/components/studio-navbar.tsx:73` | Сайдбар кабинета клиента и навбар студии без фона/бордера/blur — `rounded-[26px] p-4` без поверхности |
| `fade-in-up` | 13: `public-profile/master/sections/{hero,booking,portfolio,reviews,services}-section.tsx` · `public-studio/sections/*` ×8 | Анимация появления секций публичных профилей не происходит вообще |
| `histogram-slider-thumb` | `catalog/components/histogram-slider.tsx:113,124` | Ползунки фильтра цены в дефолтном UA-виде |
| `border-bg-main` | `studio-cabinet/settings/components/profile-media-editor.tsx:307` | Бордер аватара |

**Направление фикса.** `bg-bg-elevated`→`bg-elevated`, `border-bg-main`→`border-text-main` (или нужный токен); для `glass-panel`, `fade-in-up`, `histogram-slider-thumb` — либо вернуть правила в `globals.css` (вместе с `lux-*`, UI-01: все они пропали в одном коммите `68c17f9`), либо переписать на утилиты.

---

**UI-08 · `pb-safe` / `pt-safe` — не классы Tailwind; cookie-баннер не учитывает safe-area**
**Трудоёмкость: S**

`plugins: []` (`tailwind.config.js:96`), плагина safe-area нет; зонд с `pb-safe pt-safe` не порождает правил.

- `src/components/layout/cookie-notice.tsx:61`
  ```tsx
  className="fixed bottom-0 left-0 right-0 z-[45] p-3 pb-safe md:p-5"
  ```
  Фиксированный нижний баннер на iPhone с home-indicator'ом уезжает под системную полосу. Это compliance-поверхность (RKN-FIX-06) — попадание по кнопке «Понятно» деградирует. Все прочие нижние fixed-элементы safe-area учитывают (`bottom-nav.tsx:175,327` и др. через `style={{paddingBottom:"env(safe-area-inset-bottom)"}}`) — то есть проект знает, как надо, и здесь единственное исключение.
- `src/app/offline/page.tsx:9` (`pt-safe pb-safe`), `src/components/pwa/update-prompt.tsx:58`, `src/components/ui/network-banner.tsx:23` (`pt-safe`) — верхние баннеры под вырезом.

Дополнительно: `globals.css:225-228` объявляет `--safe-area-inset-{top,right,bottom,left}`, но `grep -rn "var(--safe-area-inset" src` → **0 потребителей** — мёртвые переменные.

**Направление фикса.** Либо `pb-[env(safe-area-inset-bottom)]` (форма уже используется и компилируется — `cabinet-bottom-nav.tsx:31`), либо добавить утилиты `.pt-safe/.pb-safe` в `@layer utilities` через уже объявленные переменные — тогда и переменные оживут.

---

**UI-09 · `border-subtle` 1.46:1 / 1.17:1 — провал WCAG 1.4.11 для границ элементов управления**
**Трудоёмкость: M**

`L(#E0D0C8)=0.65129` vs `L(#FFFCF8)=0.97658` → **1.46**; тёмная: `L(#5A1820)=0.02931` vs `L(#302026)=0.01801` → **1.17**. Порог для границ, определяющих компонент, — 3:1.

Токен несёт границы у `secondary`/`icon`-кнопок (`button.tsx:25,40`), `Badge` (`badge.tsx:7,26`), `SectionCard` (`section-card.tsx:16`), таблиц, `ModalSurface` (`modal-surface.tsx:174`), нижних навигаций. В связке с UI-01 (поля вообще без рамки) это означает: **границы интерактивных элементов в продукте либо отсутствуют, либо на пределе неразличимости.**

**Направление фикса.** Ввести двухступенчатую систему: `--border-subtle` оставить для декоративных делителей, добавить `--border-control` ≥3:1 (светлая ≈ `#B9A69E` ~2.9 → нужно темнее, ориентир `#A08E86`; тёмная ≈ `#7A4048`) и перевести на него поля/кнопки/переключатели.

---

**UI-10 · `text-primary` как ЦВЕТ ТЕКСТА в тёмной теме — 1.42:1; на `/login` иконка фокуса исчезает**
**Трудоёмкость: S**

Раскол `--primary` (заливка) ↔ `--accent-text` (текст) уже сделан (`globals.css:30-37,128-131`) именно из-за этого. Но 3 сайта используют `text-primary` как текст/иконку на тематизируемой поверхности:

- `src/app/login/login-client.tsx:557` и `:579`
  ```tsx
  className="… text-text-sec transition-[color,transform] duration-200 group-focus-within/field:scale-110 group-focus-within/field:text-primary"
  ```
  При фокусе поля иконка перекрашивается в `#7A102C` на `#302026` = **1.42:1** → в тёмной теме иконка при фокусе **пропадает**. Это ровно та регрессия, ради которой создавался `accent-text`, и она осталась на главной странице входа.
- `src/features/public-studio/studio-booking-flow/components/booking-hero.tsx:74` — `text-primary` поверх `from-pink-200 via-pink-400 to-primary/80`.
- `src/features/catalog/components/service-search-input.tsx:233` — `text-primary-magenta` на `bg-primary-magenta/10` (сама подложка при этом мёртвая — `/10` валидна, ок).

`owner-profile-notice.tsx:17` и `owner-notice-section.tsx:23` (`text-primary/60`) — декоративная иконка, не текст; допустимо.

Исключение, которое трогать нельзя: `button.tsx:37` `inverted` — `bg-white text-primary`; там фиксированная светлая заливка, пара документирована (`button.tsx:28-35`).

**Направление фикса.** `group-focus-within/field:text-primary` → `…:text-accent-text` (2 сайта).

---

**UI-11 · `scroll-behavior: smooth` без гейта `prefers-reduced-motion`**
**Трудоёмкость: S**

`src/app/globals.css:231`
```css
html { scroll-behavior: smooth; }
```
Ни одного `@media (prefers-reduced-motion: reduce)`, отменяющего это (проверено — все три вхождения `prefers-reduced-motion` в файле имеют форму `no-preference` и относятся к `.focus-row-highlight` и login-FX).

Продукт делает много программных скроллов: `useFocusHighlight` (`hooks/use-focus-highlight.ts` — прокрутка к `[data-focus-id]` по deep-link `?focus=`), якоря `/terms`/`/privacy`/`/consent` (`legal-prose h2 { scroll-margin-top }`), шаги booking-визарда. Для вестибулярно чувствительного пользователя это самый заметный класс движения, и он единственный не закрыт — при том что 60 файлов и весь login-FX закрыты образцово.

**Направление фикса.**
```css
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
```

---

**UI-12 · Фрагментация моушена: 8 easing'ов, 20 длительностей, 12 дистанций, 7 hover-подъёмов**
**Трудоёмкость: M**

Полный инвентарь — в разделе «Нарушения по категориям, E»; предлагаемый канон — в разделе «Предлагаемый канонический набор моушена».

Выбросы относительно доминирующего `[0.22,1,0.36,1]` (18 сайтов, канон SKILL.md §9):
- `[0.25,0.1,0.25,1]` — **15 сайтов** (`home/components/*` ×6, `public-profile/master/*` ×3, `stories-rail.tsx` ×2, `faq-item.tsx` ×2, `notifications-center-page.tsx`, `login-client.tsx`). Это CSS-дефолтный `ease` — параллельный «второй канон».
- `[0.25,0.46,0.45,0.94]` — `not-found.tsx:20`, `ui/error-state.tsx:77`.
- `[0.4,0,0.2,1]` (Material) — `auth-user-menu.tsx:93`, `auth-mobile-menu.tsx:160`.
- `"easeInOut"` — `faq-accordion.tsx:25,38`, `features-page-client.tsx:241`; `"easeOut"` — `feed-card.tsx:34`, `catalog-page-client.tsx:836,844`.

Микровзаимодействия: `Button` даёт `active:scale-[0.99]` всем кнопкам (`button.tsx:56`), но карточки/плитки используют вразнобой `hover:scale-105`, `hover:scale-[1.04]`, `hover:scale-[1.03]`, `hover:-translate-y-0.5`, `hover:-translate-y-1`, `active:scale-95`, `active:scale-[0.98]`. SKILL.md §9 предписывает ровно `whileHover={{y:-2}}` / `whileTap={{scale:0.97}}`. Примечательно: `whileHover`/`whileTap` в проекте использованы всего **5 раз** — почти весь hover/press реализован CSS-классами, что само по себе нормально, но требует одного набора значений.

**Направление фикса.** Модуль `src/lib/ui/motion.ts` (см. канон выше) + механическая замена. Не разовая правка — сначала модуль, потом миграция по областям.

---

**UI-13 · Оверлеи вне конвенции: `admin-sidebar-mobile` объявляет `aria-modal` без focus-trap; лист нижней навигации — модальный bottom-sheet мимо `Drawer`**
**Трудоёмкость: M**

ESLint-гейт **существует и работает** (см. «Известные открытые»), поэтому позиционная часть закрыта. Новая информация — **a11y-контракт**, который в обоснованиях исключений не упомянут.

Эталон — `ModalSurface` (`modal-surface.tsx:120-143`): `createPortal` → `document.body`, `overflow:hidden` на body, ESC, `useReturnFocus` + `useInitialFocus` + `useFocusTrap` (инвариант #27). `Drawer` (`drawer.tsx:136-152,208-209,290`) — то же самое.

- **`src/features/admin-cabinet/components/admin-sidebar-mobile.tsx:44-49`**
  ```tsx
  <motion.div
    className="fixed inset-0 z-50 lg:hidden"
    role="dialog"
    aria-modal="true"
    aria-label={UI_TEXT.adminPanel.aria.sidebar}
  ```
  Есть ESC (`:34-39`). **Нет:** `createPortal`, focus-trap, `useInitialFocus`, `useReturnFocus`, блокировки скролла body. `aria-modal="true"` — это обещание вспомогательным технологиям, что фокус заперт; здесь оно ложное: скринридер и Tab уходят на страницу под оверлеем.
- **`src/components/layout/bottom-nav.tsx:174-186`** (и близнецы `master-bottom-nav.tsx:97`, `studio-bottom-nav.tsx:123`) — `fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] … shadow-2xl` со скримом `z-[49]`: это модальный bottom-sheet с интерактивным содержимым (переключатель ролей), а не «nav backdrop». Нет `role="dialog"`, ESC, focus-trap, scroll-lock. В exempt-листе (`eslint.config.mjs:74-76`) он классифицирован как «mobile-nav backdrop» — классификация покрывает скрим, но не сам лист.
- **`src/features/media/components/portfolio-editor.tsx:241`**
  ```tsx
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
  ```
  Исключён осознанно (`eslint.config.mjs:86-90`) — обоснование про полноэкранность и card-chrome корректно. Но там же сказано, что остаточная опасность — только позиционная; на деле у лайтбокса **нет ESC, focus-trap, return-focus и scroll-lock** (закрытие только кликом по невидимой кнопке `:242`). Позиционного риска сейчас нет — цепочка предков прослежена (`portfolio-section.tsx:21` → `SectionCard` (`section-card.tsx:13` — `rounded-2xl border bg-bg-card p-4`, без transform/filter) → `studio-settings-page.tsx:47-56` (`grid`, `space-y`) → `AppShellContent` (`app-shell-content.tsx:24-27`, `w-full`) → `layout`; containing block никто не создаёт). Но `TopbarShell` с `backdrop-blur-md` в дереве **есть** (`topbar-shell.tsx:28`) — предок соседний, не прямой; одно перемещение компонента, и позиционный дефект появится.

**Направление фикса.** Извлечь `useModalA11y`-контракт (`components/ui/use-modal-a11y.ts` уже готов) в эти три места, не меняя визуал: `admin-sidebar-mobile` → `Drawer side="left"`; лист bottom-nav → `Drawer side="bottom"`; для полноэкранных вьюеров завести примитив `FullBleedOverlay` (портал + a11y-контракт, без card-chrome) — это и есть `OVERLAY-FULLBLEED-PORTAL-PRIMITIVE` из BACKLOG.

---

**UI-14 · Инвентарь z-index: `z-[100]` заперт в stacking-context `z-30`; `z-[9999]` перебивает модалки**
**Трудоёмкость: M**

`src/components/layout/topbar-shell.tsx:28`
```tsx
"sticky top-0 z-30 border-b border-border-subtle/60 bg-bg-page/85 backdrop-blur-md transition-shadow duration-200",
```
`position: sticky` + `z-index: 30` создаёт stacking context. `AuthUserMenu` и `AuthMobileMenu` рендерятся внутри (`topbar.tsx:221,227,238`) и объявляют:

`src/components/layout/auth-user-menu.tsx:94`
```tsx
className="absolute right-0 z-[100] mt-2 w-64 rounded-3xl border border-border-subtle/80 bg-bg-card/95 p-2 shadow-hover backdrop-blur"
```
`src/components/layout/auth-mobile-menu.tsx:161` — то же с `z-[100]`.

Глобально они всё равно на **z-30**, т.е. ниже `z-40` (нижние навигации), `z-[45]` (cookie-баннер), `z-[46]` (PWA-промпт), `z-[49]`, `z-50`. На мобильном меню пользователя и cookie-баннер/нижняя навигация занимают одну зону экрана.

Обратный полюс: `booking-card-actions-menu.tsx:227` и `schedule-settings/hours/day-action-menu.tsx:126` — `fixed z-[9999]`; контекст-меню всплывёт над любой модалкой.

**Направление фикса.** Ввести именованную шкалу (напр. `--z-nav:40; --z-notice:45; --z-scrim:49; --z-modal:50; --z-popover:60`) и заменить магические числа; для меню в топбаре — портал (тогда z-index станет глобальным и `z-[100]` можно снизить до `--z-popover`).

---

**UI-15 · Нет общего `Checkbox`; 14 сайтов, 4 разных оформления, включая сырой UA-чекбокс в диалоге удаления аккаунта**
**Трудоёмкость: M**

`ls src/components/ui/` — компонентов `checkbox.tsx` и `alert.tsx` нет, хотя SKILL.md §6 предписывает оба.

| file:line | className | Что получилось |
|---|---|---|
| `src/features/auth/components/legal-consent-group.tsx:64` | `"mt-0.5 h-4 w-4 shrink-0 rounded border border-border-subtle bg-bg-card accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"` | наиболее полный вариант (согласия 152-ФЗ) |
| `src/app/support/support-client.tsx:374` | `"mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"` | без рамки и focus-ring |
| `src/features/public-studio/…/steps/you-step.tsx:128` | `"sr-only"` + свой визуальный переключатель | третий паттерн |
| **`src/components/deletion/DeleteAccountModal.tsx:48`** | `"mt-1"` | **сырой чекбокс браузера**: системный синий, без бренд-акцента, без focus-ring из системы |

`DeleteAccountModal` — необратимое действие; там же контроль выглядит наименее оформленным. Остальные 10 сайтов: `list-header.tsx:55`, `comparison-toggle.tsx:40`, `edit-item-modal.tsx:232`, `upload-modal.tsx:260`, `bundle-modal.tsx:214,294`, `service-modal.tsx:453`, `public-model-offer-apply.tsx:214`, `partnership-form.tsx:244`, `analytics-controls.tsx:83`.

**Направление фикса.** Добавить `src/components/ui/checkbox.tsx` (взять за основу вариант из `legal-consent-group.tsx` — он самый полный) и `alert.tsx`; мигрировать 14 сайтов. Начать с `DeleteAccountModal`.

---

**UI-16 · Ни один из 15 гейтов не ловит мёртвый CSS-класс — 192 сайта прошли CI незамеченными**
**Трудоёмкость: M**

`npm run check` зелёный (кроме средового EPERM), `npx eslint src` — **0 warning'ов**, при этом в дереве живут 192 сайта классов, компилирующихся в ничто (UI-01, 02, 03, 06, 07, 08). Проектный контекст фиксирует, что этот класс дефекта уже случался трижды (`shadow-brand` — 7 сайтов, `bg/text-destructive` — 3, точка статуса на `/login`) и каждый раз находился глазами.

Существующие гейты по своей природе его не видят: `lint` смотрит AST, `typecheck` — типы, `check:ui-text` — русские строки, `check:encoding`/`mojibake` — байты. Класс-строка для всех них — просто строка.

**Направление фикса.** Гейт `check:dead-classes` по методу этого аудита: извлечь кандидаты из `src/`, скомпилировать зонд боевым Tailwind, вычесть реестр заведомо кастомных классов (`lux-*`, `login-*`, `map-*`, `rdp-*`, `aurora-bg`, `legal-prose`, `focus-row-highlight`, `scrollbar-hide` — по образцу `scripts/raw-sql-objects.mjs`), упасть на остатке. ~120 строк, ~1 c в CI, ловит все шесть находок разом и делает возврат невозможным.

---

**UI-17 · Копирайт: 200 из 301 строки ошибок вне шаблона; 13 строк начинаются «Не получилось»; 6 вариантов «Ошибка API»**
**Трудоёмкость: M**

Канон — `src/lib/ui/text.ts:21` `UI_TEXT.common.errorGeneric = "Не удалось выполнить действие. Попробуйте ещё раз."`

- **Шаблону следуют 101 из 301 (34 %).**
- **118** — без завершающей фразы и без точки: `text.ts:645` `"Не удалось отправить код"`, `:731` `"Не удалось войти через Telegram"`, `:3924`/`:2017`/`:4111`/`:4907`/`:4938`/`:4993`/`:5184`/`:5518` `"Не удалось сохранить"` (без объекта), `:4956` `"Не удалось удалить"`, `:7913` `"Не удалось загрузить чат"`, `:7914` `"Не удалось отправить сообщение"`.
- **45** — точка есть, «Попробуйте ещё раз.» нет: `:5` `"Не удалось загрузить блок."`, `:969`, `:3351`, `:4730`, `:5349`.
- **13** — другой глагол: `text.ts:1119-1125,1411-1413,1484,3631,3632` — `"Не получилось загрузить расписание. Попробуйте ещё раз."` и т. д. В остальном шаблон соблюдён идеально, расходится только зачин. Прямая коллизия: `:1121` `"Не получилось сохранить график…"` рядом с `:1131` `"График сохранён."`
- **17** — родовое: `"Ошибка API"` (`:1379,6001,6034,6137,6168,6180,6186`), `"Ошибка API:"` (`:5154`), `"Ошибка:"` (`:3925`), `"Ошибка"` (`:1381,5083`), `"Ошибка удаления"` (`:1483`), `"Что-то пошло не так"` (`:7733`).
- Дубль одной строки в двух написаниях: `:4155` `"Не удалось загрузить отзывы"` vs `:5349` `"Не удалось загрузить отзывы."`

`src/lib/api/errors.ts` русских строк не содержит вовсе (только `"Internal error"` на `:170,:195`) — весь клиентский текст в `text.ts`.

---

**UI-18 · Копирайт: 57 CTA вне правила инфинитива; 4 «ты»-императива на «вы»-продукте**
**Трудоёмкость: M**

(«Понятно» в cookie-баннере, `text.ts:43`, — ратифицированное исключение RKN-FIX-06, не считается.)

- **Навигационные направления, 19:** `"Назад"`/`"Далее"`/`"Вперёд"` — `text.ts:4498,4499,5614,5734,5735,6396,6397,7503,7564,7574,7595,7674,7675,7724,7752,7967`, `"Следующее"` `:1709`, `"Предыдущее фото"`/`"Следующее фото"` `:1931,1932`, `"Следующий"` `:2545`.
- **«Ещё» как кнопка, 5:** `:788,3565,3615,5245,5941` (все — оверфлоу нижних навигаций).
- **Голые существительные, 14:** `:1914` `"Фильтры"`, `:3155` `"Услуга"`, `:3156` `"Пакет"`, `:3453` `"Чат"`, `:3454` `"Действия"`, `:5661` `"Резюме"`, `:1994`/`:1999` `"Новая запись"`, `:2005` `"Превью клиента"`, `:3607` `"Горящее окошко"`, `:3140` `"Управление ролями"`, `:4035` `"+ Своя категория"`, `:1747` `"🔍 Найти по фото"` (эмодзи в CTA — единственный случай в файле), `:1190` `"+ Добавить запись"`.
- **Предложные обороты, 6:** `:419` `"Скоро будет"`, `:3144` `"Скоро"`, `:555` `"Подробнее"`, `:717` `"На главную"`, `:5269` `"В каталог"`, `:7874` `"Профиль мастера →"`.
- **«Да»/«Нет» как опции, 3:** `:2190,6903,6904`.
- **Тон — «ты» вместо «вы», 4:** `text.ts:1749`/`:1751` `"Покажи фото - найдем похожие работы"`, `:4162`/`:4163` `"Напиши ответ клиенту..."`. В остальном файле — «вы»-императивы (60+ вхождений `"Выберите…"`, `"Напишите…"`).

Строка `"Покажи фото - найдем похожие работы"` — тройной дефект в одной: «ты»-императив, дефис вместо тире и потерянная ё («найдем» вместо «найдём»).

Часть находок «Назад»/«Далее»/«Ещё» — устоявшиеся навигационные конвенции; их разумно **явно ратифицировать как исключение** (по образцу «Понятно»), а не переписывать. Остальные — под правку.

---

**UI-19 · Типографика: ё/е — 9 расходящихся пар; многоточие — 90 `…` против 88 `...`**
**Трудоёмкость: S**

Кавычки — **идеально**: `«` 107 / `»` 107, ноль `“ ”` и ноль экранированных `\"` внутри русских строк. Тире — 307 `—`, 15 `–` (все в числовых диапазонах, корректно), **2** дефиса вместо тире (`text.ts:1749,1751`, та же строка visual-search).

Ё/е — расходящиеся пары:

| Слово | Мажоритарное | Минорное — file:line |
|---|---|---|
| ещё / **еще** | 147 | `text.ts:656` `"Отправить еще раз"`, `:5194` `"…Можно добавить еще."` |
| съёмку / **съемку** | 6 | `:3797` `"время на съемку/контент"` |
| сохранён / **сохранен** | 5 | `:6027` `"Профиль сохранен"`, `:6028` `"Баннер сохранен"`, `:3720` `"Сохраненные карточки"` |
| создаём / **создаем** | 4 | `:5199` `"Создаем профиль мастера..."`, `:5202` `"Создаем студию..."` |
| звёзд / **звезд** | 2 | `:5170` `"{star} звезд"` |
| днём / **днем** | 1 | `:1168` `"Действия с днем"` — против `:2073` `"Действия с днём"` (**один и тот же аффорданс, два написания**) |
| отключён / **отключен** | 1 | `:4118` |
| подключённые / **подключенные** | 1 | `:5086`, `:5223`, `:5227` |
| найдём / **найдем** | 0 | `:1749`, `:1751` |

Многоточие — почти ровный раскол: `…` 90 vs `...` 88, с прямыми коллизиями на одном слове: `:6` `"Загрузка…"` vs `:612`/`:1108` `"Загрузка..."`; `:240` `"Отправляем…"` vs `:649` `"Отправляем..."`; `:20` `"Сохраняем..."` / `:610` `"Сохранение..."` / `:2695` `"Сохранение…"`.

Проверено и чисто: `её`/`ее`, `приём`, `объём`, `счёт`, `нашёл`, `зачёт`, `тёмн`, `жёлт`, `мёд`, `свёкл`. Раскол `все`/`всё` (109/16) грамматически корректен — не дефект.

---

**UI-20 · Форматирование дат и денег: 102 ad-hoc-сайта против 13 в общих модулях (11 % централизации)**
**Трудоёмкость: L**

Общие модули (`src/lib/ui/fmt.ts`, `src/lib/format.ts`, `src/lib/schedule/timezone.ts`, `src/lib/ui/zone-label.ts`) содержат **13** реальных вызовов; вне них — **102**.

Наиболее показательное — деньги, три почти одинаковых форматтера, различающиеся только источником символа рубля:
- `src/features/home/components/feed-card.tsx:17` — `` `${Math.round(kopeks/100).toLocaleString("ru-RU")} ${UI_TEXT.common.currencyRub}` ``
- `src/features/home/components/top-masters-section.tsx:53` — то же
- `src/features/home/components/hot-slots-preview.tsx:66` — `` `${Math.round(kopeks/100).toLocaleString("ru-RU")} ₽` `` (литерал `₽`, не `UI_TEXT`)

Плюс дублирующий модуль денег: `src/features/admin-cabinet/billing/lib/kopeks.ts:7,13` (`RUB_NO_DECIMALS`, `RUB_AT_MOST_2`) — параллель к `src/lib/money/kopeks.ts` + `src/lib/format.ts`.
Плюс пять пер-секционных синглтонов в кабинете мастера: `analytics/lib/format.ts:9`, `clients/lib/format.ts:7`, `model-offers/lib/format.ts:6`, `profile/lib/format.ts:1`, `services/lib/format.ts:3`.
Плюс **деньги форматируются прямо внутри `text.ts`** — `src/lib/ui/text.ts:920`: `` `На прошлой неделе: ${bookings} …, ${revenue.toLocaleString("ru-RU")} ₽` ``.
Плюс три конвенции сокращения крупных сумм: `admin-cabinet/billing/lib/kopeks.ts:48,51` (`млн ₽` / `тыс ₽`), `master/components/analytics/lib/format.ts:21` (`M`), `app/login/login-showcase.tsx:26-27` (`M`/`k`).
Плюс `src/features/catalog/components/histogram-slider.tsx:22` — инлайновое `/100` + `₽`, дублирующее `UI_FMT.priceLabel`.

Даты: `success-phase.tsx:23,29,34,46` — четыре отдельных `Intl.DateTimeFormat` в одном файле; `client-bookings-page.tsx:442,445,446,707,713,721` — шесть в одном.

⚠️ Пересечение с AUDIT-04/timezone: `public-studio/…/steps/master-step.tsx:109` — `.toLocaleString("ru-RU", {` с комментарием на `:108`, прямо отмечающим отсутствие tz. Правкой в рамках этого аудита не занимаюсь — передаю в tz-трек.

---

**UI-21 · 32 захардкоженные русские строки в `aria-label` / `title` / `placeholder` — вне зоны гейта**
**Трудоёмкость: S**

`scripts/check-ui-text.mjs:4-11` сканирует только `src/features/{public-profile,public-studio,booking,reviews,media}` и `src/app/(public)/u/[username]/page.tsx`. Всё ниже — вне этих корней, поэтому гейт зелёный.

**Строковые литералы, 21:** `layout/bottom-nav.tsx:189` `aria-label="Закрыть"` · `layout/topbar.tsx:201` `"Основная навигация"` · `catalog/components/catalog-pagination.tsx:44` `"Пагинация"` · `catalog/components/histogram-slider.tsx:106,117` `"Минимальная/Максимальная цена"` · `client-cabinet/favorites/client-favorites-page.tsx:314,377,432` · `client-cabinet/profile/modals/telegram-connect-modal.tsx:72,90` (`title=`) · `crm/components/client-card-drawer.tsx:263` (`placeholder=`) · `home/components/stories-rail.tsx:144,161` · `master/components/clients/client-detail-skeleton.tsx:12` · `master/components/clients/clients-tabs.tsx:32` · `master/components/master-bottom-nav.tsx:109,151` · `master/components/master-page-header.tsx:39` · `master/components/notifications/notifications-tabs.tsx:58` · `model-offers/components/category-filter.tsx:22` · `model-offers/components/educational-sections.tsx:21`.

**Шаблонные литералы, 7:** `components/ui/otp-input.tsx:216` `` aria-label={`Цифра ${index+1} из ${length}`} `` · `admin-cabinet/reviews/components/review-rating-stars.tsx:20` · `catalog/components/photo-carousel.tsx:63` · `master/components/reviews/reviews-distribution.tsx:46` · `master/components/reviews/stars-display.tsx:38` · `search-by-time/components/slot-bubbles-row.tsx:47` · `studio-cabinet/reviews/components/rating-stars.tsx:23`.

Один и тот же a11y-ярлык рейтинга существует в **четырёх** формулировках: `"${rating} из 5"` (админ), `"${value} из 5"` (студия), `"Рейтинг ${…} из 5"` (мастер), `"${star} звёзд: ${count} (${percent}%)"` (распределение).

**Не-атрибутные пропсы, 4:** `components/billing/PaywallCard.tsx:33` `t.description("эту функцию")` · `client-cabinet/profile/client-profile-page.tsx:383,459,546` (`subtitle="…"`).

`toast`/`alert(`/`confirm(` — **ноль** нарушений; `alt="…"` с русским — **ноль**.

**Направление фикса.** Расширить `ROOTS` в `scripts/check-ui-text.mjs` на `src/components` и остальные `src/features`, добавив явный allowlist для оставшегося; иначе список отрастёт заново.

---

**UI-22 · Типографическая шкала не имеет ступени ниже 12px — 496 сайтов изобретают свою**
**Трудоёмкость: M**

`text-[10px]` ×261, `text-[11px]` ×204, `text-[9px]` ×25, `text-[10.5px]` ×6, плюс единичные `[8px]`, `[11.5px]`, `[12.5px]`, `[13.5px]`, `[14.5px]`. Шкала SKILL.md §4 заканчивается на `mono 13` / `small 14`.

`text-[9px]` (25 сайтов) — на грани читаемости; в кабинетах это eyebrow-подписи и метки колонок, т.е. функциональный текст, а не декор.

Радиусы: `rounded-[24px]` ×12, `[28px]` ×7, `[20px]` ×7, `[16px]` ×4, `[22px]` ×3, `[32px]` ×2, `[26px]` ×2 — семь значений вне `rounded-lg/xl/2xl`.

**Направление фикса.** Добавить в `tailwind.config.js` ступени `fontSize` (`micro: 11px`, `nano: 10px`) и `borderRadius` (`card: 24px`, `panel: 28px`, `pill: 20px`) — тогда 496+37 произвольных значений схлопнутся в токены, а SKILL.md станет описывать реальность.

---

**UI-31 · 20 сырых полей без программной связи с меткой; корень — хелпер `Field` с оторванным `<label>`**
**Трудоёмкость: M**

Из 63 сырых `<input>/<select>/<textarea>` (минус 5 в комментариях и 3 самих shared-обёртки, которые спредят `{...props}` — именование там задача вызывающего) **20 не имеют ни `htmlFor`-связи, ни `aria-label`**.

**Корневая причина — локальный хелпер.** `src/features/master/components/services/modals/service-modal.tsx:420-429`
```tsx
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
```
`<label>` не оборачивает контрол (между ними `<div>`) и не несёт `htmlFor` → **ни одно поле этого модала не имеет программного имени**; визуально подпись есть, для AT её нет. Затронуты `service-modal.tsx:258,332`.

Тот же оторванный `<label>` инлайном: `portfolio/modals/upload-modal.tsx:243` (метка `:240`) · `portfolio/modals/edit-item-modal.tsx:176` (`:173`) · `services/modals/bundle-modal.tsx:240` (`:236`) · `booking-flow/phases/form-phase.tsx:222` (`:219`, видимый file-input) · `public-studio/studio-booking-flow/booking-flow.tsx:766` (`:763`, видимый file-input).

**Без метки вообще:**
- `src/features/chat/composer/composer.tsx:297` — textarea сообщения, только placeholder;
- `src/features/master/components/portfolio/modals/tag-input.tsx:99` — поле ввода тегов; placeholder гасится, как только теги появились (`:98` `placeholder={value.length === 0 ? T.tagsPlaceholder : ""}`) → **после первого тега поле полностью безымянно**;
- `src/features/studio-cabinet/components/studio-profile-form.tsx:189` — автодополнение адреса; «метка» — `<div>` (`:183`), связать нечем.

Плюс 9 скрытых file-input (`className="hidden"`, вызываются подписанной кнопкой) — ниже по важности, они не в tab-порядке.

**Образец правильного паттерна уже в кодовой базе:** `src/features/master/components/clients/sort-select.tsx:37` — `<select>` внутри `<label>` с `<span className="sr-only">`.

**Направление фикса.** Починить `Field` (сгенерировать `useId` и связать `htmlFor`/`id`) — это одним изменением закрывает весь модал услуг; затем 6 инлайновых случаев и 3 безымянных поля.

---

**UI-32 · 7 элементов теряют индикатор фокуса; 5 из них — inline-edit-строки профиля мастера**
**Трудоёмкость: S**

Всего `outline-none` — 74 вхождения; большинство закрыто либо вариантом `Button` (`button.tsx:21-43` — все 7 вариантов дают `focus-visible:ring-2`), либо базовым правилом `globals.css:217-221` для нативных полей. **Не закрыто 7:**

**Кнопка (базовое правило на неё не распространяется — оно только для `input/textarea/select`):**
`src/features/home/components/stories-rail.tsx:59`
```tsx
className="flex w-[84px] shrink-0 snap-start flex-col items-center gap-1.5 focus-visible:outline-none sm:w-[92px]"
```
Ни `ring`, ни `outline`, ни `border`, ни `underline` — фокус на ленте сториз (главная страница) невидим с клавиатуры.

**Поля, где утилита `focus:ring-0` / `focus-visible:ring-0` перебивает базовое правило** (оно в `@layer base`, любая утилита выигрывает), а `border-primary` безусловен и на фокус не реагирует:
- `master/components/profile/editable/address-editor.tsx:182`
- `master/components/profile/editable/editable-field-row.tsx:136`
- `master/components/profile/editable/editable-textarea-row.tsx:122`
- `master/components/profile/editable/social-editable-row.tsx:136`
- `master/components/profile/editable/username-editable-row.tsx:164` — здесь бордера нет вовсе: `"min-w-0 flex-1 border-0 bg-transparent text-sm text-text-main outline-none focus:ring-0"` → **нулевая обратная связь по фокусу**
- `studio-cabinet/components/studio-profile-form.tsx:204` + `:37`
  ```tsx
  const inputClass = "border border-white/10 bg-white/6 focus-visible:border-white/20 focus-visible:ring-0";
  ```
  `focus-visible:ring-0` гасит базовое кольцо; остаётся переход бордера `white/10 → white/20` — дельта ~10 % альфы, кратно ниже 3:1. Тот же `inputClass` применён на `:163,176,242,251,264,274`. (Заодно `bg-white/6` — мёртвый класс, UI-02.)

Это ровно те пять строк, где живёт главный паттерн кабинета — inline-edit с автосохранением (SKILL.md §7). Клавиатурный пользователь не видит, какое поле редактирует.

---

**UI-33 · ~20 контентных изображений с `alt=""` + одна кнопка с пустым доступным именем**
**Трудоёмкость: M**

`alt=""` — 48 вхождений. Честно декоративных **3** (`brand/logo-mark.tsx:33` — контракт именования задокументирован на `:24`; `app/login/login-showcase.tsx:305`; `api/og/profile/route.tsx:125` — не DOM).

**Контентные фото, где `alt=""` выбрасывает единственную информацию (20):** `home/components/stories-viewer-overlay.tsx:246` (сама сториз) · `master/components/portfolio/portfolio-card.tsx:111` · `master/components/profile/sections/portfolio-readonly-section.tsx:62` · `master/components/portfolio/modals/edit-item-modal.tsx:141` · `master/components/portfolio/modals/upload-modal.tsx:213` · `media/components/portfolio-editor.tsx:199,244` · `public-studio/sections/photos-section.tsx:54` · `public-studio/studio-hero-gallery.tsx:77` · `public-studio/studio-masters-carousel.tsx:147` · `crm/components/client-card-drawer.tsx:308` · `master/components/model-offers/application-photos.tsx:33` · `client-cabinet/reviews/client-reviews-page.tsx:372` · `chat/chat-window/message-bubble.tsx:61` (вложение в чат) · `chat/composer/composer.tsx:245` · `home/components/visual-search-modal.tsx:319` · `media/components/crop-picker.tsx:56` · `media/components/avatar-editor.tsx:145,171` · `studio-cabinet/components/studio-profile-hero.tsx:48`.

Портфолио — основной контент продукта: у мастера это витрина работ, у клиента — критерий выбора. Пустой `alt` делает её недоступной целиком.

Ещё 26 — аватары рядом с видимым именем: это конвенциональный «избыточный образ», формально допустимо, менять не обязательно.

**Отдельно — единственный интерактивный элемент во всём `src/` с пустым доступным именем:**
`src/features/media/components/portfolio-editor.tsx:198`
```tsx
<Button variant="wrapper" className="relative h-full w-full" onClick={() => setPreviewUrl(asset.url)}>
  <ResilientImage src={asset.url} alt="" sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
</Button>
```
Единственный потомок — картинка с пустым `alt`, у кнопки нет `aria-label`/`title` → **вычисленное имя пусто**; скринридер объявит «кнопка» без содержания.

**Направление фикса.** Портфолио и медиа уже хранят подписи/теги (`MediaAsset`) — протянуть их в `alt`; при отсутствии — осмысленный шаблон («Работа мастера {имя}, {категория}»). Для `portfolio-editor.tsx:198` — `aria-label` из `UI_TEXT` (например `mediaText.openPreviewAria`, рядом уже есть `closePreviewAria` на `:242`).

---

**UI-34 · OTP-форма: эффект перехватывает фокус и ломает Arrow-навигацию; нет `pattern`, `autoComplete` только на первой ячейке**
**Трудоёмкость: S**

`src/components/ui/otp-input.tsx` — 6 отдельных `<input>` в контейнере `role="group"` (`:183-192`). Базовое поведение **хорошее**: `inputMode="numeric"` на каждой ячейке (`:208`), вставка полного кода обрабатывается на любой ячейке с фильтрацией не-цифр и авто-сабмитом (`:167-175`), Backspace каскадом с `preventDefault()` (`:148-159`), ArrowLeft/ArrowRight с зажимом на краях (`:160-165`).

Дефекты:

1. **Эффект перехватывает фокус на каждое изменение значения** — `:112-118`
   ```tsx
   useEffect(() => {
     if (value.length >= length) {
       refs.current[length - 1]?.focus();
     } else {
       refs.current[value.length]?.focus();
     }
   }, [value, length]);
   ```
   Пользователь ушёл стрелкой на 3-ю ячейку исправить цифру → при первом же вводе фокус улетает на «первую пустую». Реализованная Arrow-навигация тем самым обесценивается: исправить середину кода нельзя. Плюс `autoFocus` по умолчанию `true` (`:108-110`) — сетка забирает фокус при монтировании.
2. **`autoComplete="one-time-code"` только на первой ячейке** (`:209` — `index === 0 ? "one-time-code" : "off"`). Автозаполнение кода из SMS/почты в Safari/iOS работает по группе полей; на остальных ячейках `off` подавляет подстановку.
3. **`pattern` отсутствует**, `type="text"` (не `tel`/`number`). `inputMode` даёт цифровую клавиатуру, но валидации формата на уровне разметки нет.

`/login` — production-вход (e-mail-OTP), т.е. это единственная форма, через которую проходит **каждый** пользователь.

**Направление фикса.** Ограничить эффект: перефокусировать только когда изменение пришло от ввода в текущую ячейку или вставки, а не на любое `value` (например, сравнивать с предыдущей длиной и не двигать фокус при правке существующей цифры). `autoComplete="one-time-code"` — на все ячейки. Добавить `pattern="[0-9]*"`.

---

### P3 🔵 — nice-to-have

---

**UI-35 · 5 глобальных `<nav>` без `aria-label`** — **S**
На странице сосуществует несколько навигаций, и в списке лендмарков скринридера они неразличимы: `features/cabinet/layout/cabinet-bottom-nav.tsx:27`, `features/master/components/master-sidebar.tsx:148`, `features/studio-cabinet/components/studio-navbar.tsx:84,133`, `features/admin-cabinet/components/admin-sidebar.tsx:42`.
Правильный образец рядом: `layout/footer/Footer.tsx:88` (`aria-label={UI_TEXT.footer.aria.nav}`), `catalog/components/catalog-pagination.tsx:44`, `model-offers/components/category-filter.tsx:22`, `legal/components/legal-layout.tsx:76`.
Заодно: `<footer>` (`contentinfo`) намеренно скрыт на `/cabinet` и `/admin` через `ConditionalFooter` (`app-shell.tsx:24`) — так и задумано, не находка.

**UI-36 · Мелочи доступности** — **S**
- `features/master/components/portfolio/modals/tag-input.tsx:90` — `aria-label="remove"` английской строкой в полностью русском интерфейсе (все остальные 81 иконочная кнопка берут ярлык из `UI_TEXT`/`T.*`).
- `components/billing/FeatureGate.tsx:153` — `<div aria-hidden className="pointer-events-none select-none opacity-30 blur-[2px]">`: `pointer-events-none` есть, но любой фокусируемый потомок останется достижим по Tab, будучи скрытым от AT. Просится `inert`.

---

**UI-23 · CSS-переменные-сироты** — **S**
`--rose`, `--sky` (`globals.css:40-41,134-135`) — 0 потребителей в JSX/CSS, при этом `rose-*`/`sky-*` в разметке резолвятся во встроенную палитру Tailwind; комментарий `:93` («use `--rose` for pink badges») дезинформирует.
`--glass-border`, `--glass-bg` (`:59-60,144-145`) — 0 потребителей.
`--safe-area-inset-*` (`:225-228`) — 0 потребителей.
Либо достроить мост, либо удалить вместе с комментариями.

**UI-24 · Имена вариантов в SKILL.md разошлись с кодом** — **S**
`Button`: skill `default|secondary|ghost|outline|destructive` ↔ код `primary|secondary|ghost|danger|icon|wrapper|inverted` (`button.tsx:5-12`).
`Badge`: skill `default|primary|success|warning|danger|cool|hot` ↔ код `default|success|warning|danger|info|muted` (`badge.tsx:4`).
`Checkbox`, `Alert`, `Tabs`+`Switch` из таблицы SKILL.md §6 — `Checkbox` и `Alert` в `src/components/ui/` отсутствуют. Синхронизировать документ с кодом (или наоборот), иначе агент будет писать несуществующие варианты.

**UI-25 · `Button variant="danger"` игнорирует токен `destructive`** — **S**
`src/components/ui/button.tsx:38`
```tsx
danger: "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-2 focus-visible:ring-red-500",
```
`--destructive` объявлен в обеих темах (`globals.css:98,175`) **и имеет мост** (`tailwind.config.js:68-71`) — единственный правильно оформленный токен состояния, и он не используется в единственном месте, ради которого создавался. `bg-red-600` не реагирует на тему.

**UI-26 · 204 сырых `<button>` и 63 сырых поля** — **L**
Больше всего: `public-studio/components/studio-package-flow.tsx` (6), `home/components/stories-viewer-overlay.tsx` (6), `studio-cabinet/schedule/components/schedule-header.tsx` (5), `master/components/portfolio/portfolio-card.tsx` (4). Часть законна (headless-обёртки, click-catcher'ы), но объём означает, что фокус-кольца, размеры и press-состояния задаются вручную и расходятся. Мигрировать по областям, начиная с кабинета мастера.

**UI-27 · 548 ad-hoc `dark:`-оверрайдов** — **L**
Распределение: master 167, studio 142, admin 83, app 23, `components/ui` 20, client 17, home 9, catalog 4, booking 3, **`components/layout` 0**. Нулевой `components/layout` доказывает, что чисто токенная запись достижима. Каждый `dark:` — это место, где семантического токена не хватило; кандидаты на новые токены (по частоте): статусные фоны, `rose`-акценты danger-зон, `emerald`-успех.

**UI-28 · Захардкоженная бренд-тень** — **S**
`src/features/master/components/schedule/booking-card-week.tsx:67` — `shadow-[0_4px_14px_-4px_rgba(114,8,8,0.45)]`. `114,8,8` — это `--brand-from`; есть готовый `shadow-brand` (мост в `tailwind.config.js:92`). В тёмной теме захардкоженная тень не переключается на бордовое свечение.

**UI-29 · Тач-таргеты на границе** — **S**
`button.tsx:49` `icon: "h-10 w-10"` = 40px (минимум пройден, до 44px Apple HIG / WCAG 2.5.5 AAA не дотягивает); `sizes.sm = "h-9"` = 36px. Иконочные кнопки с `p-1.5`/`p-0.5` вокруг `h-4 w-4` (напр. `bottom-nav.tsx:185-188`, `public-username-card.tsx:120`) дают ~28–32px. На мобильных кабинетах это основной способ вызова действий.

---

## Известные открытые — верифицированный статус

| Пункт | Статус на `main` |
|---|---|
| **ESLint-правило для конвенции модалок** — задание требовало подтвердить или опровергнуть | ✅ **СУЩЕСТВУЕТ и работает.** `eslint.config.mjs:38-55` — `no-restricted-syntax` **warn**-уровня на `Literal[value=/fixed inset-0\|fixed top-0 left-0 right-0 bottom-0/]` + `TemplateElement[...]`, с развёрнутым сообщением и ссылкой на `docs/QUALITY-GATES.md`. Exempt-лист (`:70-91`) — 10 файлов, три задокументированные категории. `npx eslint src` → **0 warning'ов**, т.е. новых нарушений нет. Открытым остаётся не гейт, а **a11y-контракт** внутри исключений (UI-13) и `OVERLAY-FULLBLEED-PORTAL-PRIMITIVE` в BACKLOG. |
| `minBookingHoursAhead` / `slotPrecision` / `lateCancelAction` enforcement | Вне scope UI-аудита, не проверял. |
| OTP в логах (CLAUDE.md rule 9) | Намеренно; не трогал. |
| VK Bot delivery | Вне scope. |
| Версия pgvector на проде | Вне scope. |
| Сброс формы в диалоге manage-breaks | Не переоткрываю — регрессии не наблюдал. |
| Метка времени брони в `system-message.tsx` | Не переоткрываю. |
| `check:include-where` baseline (38 include в 23 файлах) | Гейт зелёный, baseline информационный. Не находка. |

---

## Гипотезы — не доказано

Требуют запущенного браузера / DevTools; в отчёт как находки не вынесены.

1. **Реальная видимость поля ввода после UI-01.** Расчёт 1.05:1 и `border-width: 0` из preflight выведены из скомпилированного CSS. Не измерено пиксельно, как это выглядит на боевом рендере с наложением `focus`-ring и `box-shadow` соседей.
2. **Порядок наложения меню топбара vs нижней навигации (UI-14).** Stacking context доказан из CSS (`sticky` + `z-index`), фактическое перекрытие на 375px не снималось скриншотом.
3. **Влияние `backdrop-blur-md` у `TopbarShell` на `position: fixed`-потомков.** `backdrop-filter` создаёт containing block; сейчас все модалки порталятся, так что срабатывания нет. Не проверено, нет ли `fixed`-потомка в поддереве топбара при открытом `AuthMobileMenu`.
4. **Соответствие `bg-white/4…/8` замыслу.** Классы мёртвые (доказано). Правильная замена (`/5` против `/10`) требует визуальной сверки — сейчас неизвестно, какой оттенок задумывался.
5. **Скачок layout от `fade-in-up`.** Класс мёртвый, поэтому секции публичных профилей появляются мгновенно. Не проверено, не рассчитывал ли layout на начальное `opacity:0` (при возврате правила возможна регрессия CLS).
6. **Читаемость `text-[9px]` на реальных устройствах.** 25 сайтов; вердикт по WCAG зависит от гарнитуры и DPI — не измерялось.
7. **`prisma:generate` EPERM.** Отнесено к среде (блокировка файла Windows). Не исключено, что на чистой машине шаг проходит; воспроизводился дважды подряд на этой.
8. **Доступность проверена статически, не вспомогательными технологиями.** Доступные имена вычислялись по разметке; NVDA/VoiceOver/TalkBack не запускались. Порядок объявления лендмарков при двух `<main>` (UI-30) и фактическое поведение перехвата фокуса в OTP (UI-34) не наблюдались вживую — выведены из кода.
9. **Порядок применения `@layer base` vs утилит (UI-32).** Что `focus:ring-0` перебивает `globals.css:217-221`, следует из каскада Tailwind (`base` < `utilities`). В браузере с реальным порядком слоёв не подтверждалось.
10. **Полнота списка «контентных» `alt=""` (UI-33).** Граница «контент vs декор» проведена по типу источника (`item.mediaUrl`, `photo.url`, `asset.url` → контент; логотип/фон → декор). 26 аватаров отнесены к допустимой избыточности — это суждение, а не измерение.

---

## Предлагаемые записи в `BACKLOG.md`

> ⚠️ `BACKLOG.md` намеренно **не редактировался** (параллельно идут ещё четыре аудита). Строки ниже — готовые к мержу владельцем.

```markdown
- 🟠 **UI-DEAD-LUX-CLASSES** — `.lux-card`/`.lux-input` снесены из `globals.css` в `68c17f9`, но 27 сайтов (shared `Card`/`Input`/`Select`/`Textarea`) на них ссылаются: у полей нет рамки (preflight `border-width:0`), заливка отличается от карточки на 1.05:1 → провал WCAG 1.4.11; задето 119 импортёров, включая `/login`. Вернуть правила (дословно из `git show 68c17f9`) либо перенести стили в компоненты. → AUDIT-FRESH-05 UI-01
- 🟠 **UI-DEAD-OPACITY** — 68 классов вида `bg-primary/8`, `/12`, `bg-white/4`, `bg-emerald-500/12`: шкала opacity Tailwind — только кратные 5, остальное компилируется в ничто. Без фона остались все статус-пилюли админки, KPI-дельты, hero-ауры 6 маркетинговых страниц, 404, Visual Search, trial-промо. → AUDIT-FRESH-05 UI-02
- 🟠 **UI-DEAD-BG-MUTED** — `bg-bg-muted` не существует (в конфиге ключ `muted`): 33 сайта, из них 17 — скелетон `/u/[username]/booking/loading.tsx` (пустой экран загрузки) и 15 — гостевой booking-флоу студии (CTA успеха, индикатор шагов, скелетоны слотов). Заменить на `bg-muted` + привести именование поверхностей в конфиге к одной схеме. → AUDIT-FRESH-05 UI-03
- 🟠 **UI-OFFBRAND-ARTIFACTS** — транзакционная почта (`email/templates/otp-code.ts:17`, `notification.ts:23,45`), share-постеры кабинета (`public-settings-client.tsx`, ~50 хардкодов), OG-превью (`api/og/profile/route.tsx:12-16`) и `global-error.tsx:81` используют оставленную фиолетово-розовую палитру (`#7c3aed`/`#ec4899`/`#8b5cf6`). E-mail-OTP — единственный включённый канал входа в проде. Ввести `src/lib/ui/brand-colors.ts` для сред без Tailwind. → AUDIT-FRESH-05 UI-04
- 🟠 **UI-PLACEHOLDER-CONTRAST** — `--text-placeholder` даёт 2.39:1 на `--bg-input` в светлой теме и 3.09–3.83:1 в тёмной (порог 4.5). Задеты все поля продукта через `globals.css:216` + shared `Input`/`Textarea`. → AUDIT-FRESH-05 UI-05
- 🟠 **A11Y-DUAL-MAIN** — `app-shell.tsx:19` рендерит `<main>` безусловно на всех маршрутах, а шеллы кабинетов/админки/login кладут внутрь второй (8 сайтов) → два `main`-лендмарка на каждой аутентифицированной странице (WCAG 1.3.1). Точечный фикс в `master-profile-page.tsx:51-52` лечил симптом; дубль уровнем выше остался и известен лишь как неудобство локаторов (`playwright-qa/SKILL.md:3` «два main / dual main»). Признак `isWorkspace` уже вычисляется в `app-shell-content.tsx:20-21`. Закрепить тестом «ровно один `<main>`». → AUDIT-FRESH-05 UI-30
- 🟡 **UI-TOKEN-BRIDGE-GAP** — `muted-foreground`, `primary-foreground`, `accent-foreground`, `card-foreground`, `popover`, `rose`, `sky` объявлены в `globals.css`, но моста в `tailwind.config.js` нет → 35 сайтов без стиля, в т.ч. `Badge variant="muted"`. Достроить мост по образцу `destructive` или удалить переменные-сироты. → AUDIT-FRESH-05 UI-06, UI-23
- 🟡 **UI-DEAD-MISC-CLASSES** — `bg-bg-elevated` (6), `glass-panel` (2 — сайдбар кабинета клиента, навбар студии), `fade-in-up` (13 — анимации публичных профилей), `histogram-slider-thumb` (2), `border-bg-main` (1). → AUDIT-FRESH-05 UI-07
- 🟡 **UI-SAFE-AREA-COOKIE** — `pb-safe`/`pt-safe` не существуют (плагина нет); cookie-баннер (`cookie-notice.tsx:61`, compliance-поверхность) уезжает под home-indicator. Плюс `--safe-area-inset-*` — 0 потребителей. → AUDIT-FRESH-05 UI-08
- 🟡 **UI-BORDER-CONTRAST** — `--border-subtle` даёт 1.46:1 (светлая) / 1.17:1 (тёмная) против порога 3:1 WCAG 1.4.11. Ввести отдельный `--border-control` ≥3:1 для полей/кнопок/переключателей. → AUDIT-FRESH-05 UI-09
- 🟡 **UI-DARK-ACCENT-TEXT-TAIL** — `text-primary` как цвет ТЕКСТА даёт 1.42:1 в тёмной; `login-client.tsx:557,579` (иконка при фокусе поля на `/login`) не мигрирован на `accent-text`. → AUDIT-FRESH-05 UI-10
- 🟡 **UI-SMOOTH-SCROLL-REDUCED-MOTION** — `globals.css:231` `html { scroll-behavior: smooth }` без гейта `prefers-reduced-motion: reduce`; единственный незакрытый класс движения при том, что 60 файлов и весь login-FX закрыты. → AUDIT-FRESH-05 UI-11
- 🟡 **UI-MOTION-CANON** — 8 easing'ов, 20 длительностей framer, 12 дистанций `y:`, 7 hover-подъёмов, 3 press-варианта. Ввести `src/lib/ui/motion.ts` (3 перехода, 1 easing) и мигрировать по областям. → AUDIT-FRESH-05 UI-12
- 🟡 **UI-OVERLAY-A11Y-CONTRACT** — `admin-sidebar-mobile.tsx:44-49` объявляет `role="dialog" aria-modal="true"` без focus-trap/return-focus/scroll-lock (ложное обещание AT); лист переключателя ролей в `bottom-nav.tsx:174` — модальный bottom-sheet мимо `Drawer`; лайтбокс `portfolio-editor.tsx:241` без ESC/trap/scroll-lock. Позиционный ESLint-гейт это не покрывает. → AUDIT-FRESH-05 UI-13
- 🟡 **UI-ZINDEX-SCALE** — `z-[100]` у меню топбара заперт в stacking-context `z-30` (`topbar-shell.tsx:28`) → меню уходит под нижнюю навигацию, cookie-баннер и PWA-промпт; `z-[9999]` у двух контекст-меню перебивает модалки. Ввести именованную шкалу + портал для меню топбара. → AUDIT-FRESH-05 UI-14
- 🟡 **UI-SHARED-CHECKBOX** — компонентов `Checkbox` и `Alert` в `src/components/ui/` нет вопреки SKILL.md; 14 сайтов чекбоксов в 4 оформлениях, в `DeleteAccountModal.tsx:48` — сырой UA-чекбокс в необратимом действии. → AUDIT-FRESH-05 UI-15
- 🟡 **CHECK-DEAD-CLASSES** — ни один из 15 гейтов не ловит класс, компилирующийся в ничто; 192 сайта прошли CI (4-й рецидив класса после `shadow-brand`, `bg/text-destructive`, точки статуса на `/login`). Гейт: извлечь кандидаты → скомпилировать зонд боевым Tailwind → вычесть реестр кастомных классов → упасть на остатке. → AUDIT-FRESH-05 UI-16
- 🟡 **UI-COPY-ERROR-TEMPLATE** — 200 из 301 строки ошибок вне шаблона «Не удалось {действие}. Попробуйте ещё раз.»; 13 начинаются «Не получилось»; 6 вариантов «Ошибка API». → AUDIT-FRESH-05 UI-17
- 🟡 **UI-COPY-CTA-VERB** — 57 CTA вне правила инфинитива + 4 «ты»-императива на «вы»-продукте. Часть («Назад»/«Далее»/«Ещё») разумно ратифицировать как исключение по образцу «Понятно» (RKN-FIX-06). → AUDIT-FRESH-05 UI-18
- 🟡 **UI-COPY-TYPOGRAPHY** — 9 расходящихся пар ё/е (включая «Действия с днем» vs «Действия с днём» для одного аффорданса); многоточие 90 `…` vs 88 `...`; 2 дефиса вместо тире. Кавычки « » — идеальны, не трогать. → AUDIT-FRESH-05 UI-19
- 🟡 **UI-FORMATTER-CENTRALIZATION** — 102 ad-hoc `Intl`/`toLocale*` против 13 в общих модулях; три почти одинаковых форматтера денег в `features/home`, дублирующий `admin-cabinet/billing/lib/kopeks.ts`, деньги форматируются внутри `text.ts:920`. → AUDIT-FRESH-05 UI-20
- 🟡 **UI-TEXT-GATE-COVERAGE** — `scripts/check-ui-text.mjs:4-11` сканирует 6 путей; вне них 32 захардкоженные русские строки в `aria-label`/`title`/`placeholder`, включая 4 формулировки одного a11y-ярлыка рейтинга. Расширить ROOTS + allowlist. → AUDIT-FRESH-05 UI-21
- 🟡 **UI-TYPE-SCALE-HOLE** — шкала обрывается на 13px, а 496 сайтов используют `text-[9/10/10.5/11px]`; 7 радиусов вне `rounded-lg/xl/2xl`. Добавить ступени в `tailwind.config.js`. → AUDIT-FRESH-05 UI-22
- 🟡 **A11Y-FORM-LABELS** — 20 сырых полей без программной связи с меткой; корень — хелпер `Field` (`service-modal.tsx:420`), где `<label>` не оборачивает контрол и не несёт `htmlFor`; плюс `composer.tsx:297`, `tag-input.tsx:99` (безымянно после первого тега), `studio-profile-form.tsx:189`. Образец правильного паттерна — `clients/sort-select.tsx:37`. → AUDIT-FRESH-05 UI-31
- 🟡 **A11Y-FOCUS-RING** — 7 элементов теряют индикатор фокуса: `stories-rail.tsx:59` (кнопка без замены) и 6 полей, где утилита `focus:ring-0`/`focus-visible:ring-0` перебивает базовое правило `globals.css:217-221` — в т.ч. все 5 inline-edit-строк профиля мастера (`username-editable-row.tsx:164` — вообще без бордера) и `studio-profile-form.tsx:37`. → AUDIT-FRESH-05 UI-32
- 🟡 **A11Y-CONTENT-ALT** — ~20 контентных изображений (портфолио, сториз, вложения чата, фото отзывов) с `alt=""`; `portfolio-editor.tsx:198` — единственный интерактивный элемент в `src/` с пустым доступным именем (кнопка, чей единственный потомок — картинка с `alt=""`). Подписи уже есть в `MediaAsset`. → AUDIT-FRESH-05 UI-33
- 🟡 **A11Y-OTP-FOCUS** — `otp-input.tsx:112-118` перефокусирует на «первую пустую» ячейку при любом изменении `value` → реализованная Arrow-навигация обесценена, среднюю цифру исправить нельзя; `autoComplete="one-time-code"` только на первой ячейке (`:209`), `pattern` отсутствует. `/login` — production-вход. → AUDIT-FRESH-05 UI-34
- 🔵 **A11Y-NAV-LABELS** — 5 из 8 глобальных `<nav>` без `aria-label` (`cabinet-bottom-nav.tsx:27`, `master-sidebar.tsx:148`, `studio-navbar.tsx:84,133`, `admin-sidebar.tsx:42`) → неразличимы в списке лендмарков. → AUDIT-FRESH-05 UI-35
- 🔵 **A11Y-MISC** — `tag-input.tsx:90` `aria-label="remove"` по-английски; `FeatureGate.tsx:153` `aria-hidden` без `inert` (фокусируемые потомки остаются в tab-порядке). → AUDIT-FRESH-05 UI-36
- 🔵 **GITIGNORE-OPENAPI** — `openapi/openapi.json` (331 КБ) пишется шагом `openapi:generate` в составе `npm run check`, никогда не коммитился и не покрыт `.gitignore` → уедет в коммит при `git add .`. Добавить `openapi/` в `.gitignore`. → AUDIT-FRESH-05 «Метод»
- 🔵 **UI-DOC-DRIFT-VARIANTS** — имена вариантов `Button`/`Badge` в SKILL.md разошлись с кодом; `Checkbox`/`Alert` документированы, но не существуют. → AUDIT-FRESH-05 UI-24
- 🔵 **UI-DANGER-TOKEN** — `Button variant="danger"` использует `bg-red-600` вместо единственного корректно замостованного токена состояния `destructive`; не реагирует на тему. → AUDIT-FRESH-05 UI-25
- 🔵 **UI-RAW-BUTTONS** — 204 сырых `<button>` и 63 сырых поля вне shared-примитивов; фокус-кольца и press-состояния задаются вручную. Мигрировать по областям. → AUDIT-FRESH-05 UI-26
- 🔵 **UI-DARK-OVERRIDE-DRIFT** — 548 ad-hoc `dark:` (master 167 / studio 142 / admin 83), при `components/layout` = 0. Каждый — место, где не хватило токена. → AUDIT-FRESH-05 UI-27
- 🔵 **UI-HARDCODED-BRAND-SHADOW** — `booking-card-week.tsx:67` `shadow-[0_4px_14px_-4px_rgba(114,8,8,0.45)]` вместо `shadow-brand`; в тёмной теме не переключается. → AUDIT-FRESH-05 UI-28
- 🔵 **UI-TOUCH-TARGETS** — `Button size="icon"` = 40px, `size="sm"` = 36px, иконочные кнопки с `p-1.5` вокруг `h-4 w-4` ≈ 28–32px. → AUDIT-FRESH-05 UI-29
```

---

## План фиксов (каждый пункт = один коммит)

Порядок выбран так, чтобы **сначала встал гейт**, иначе исправленное вернётся: метод этого аудита нашёл 192 сайта, которые CI пропускал месяцами.

| # | FIX-промпт | Содержание | Зависит от |
|---|---|---|---|
| 1 | **FIX-05-01 · `check:dead-classes`** | Гейт по методу аудита (зонд + компиляция + реестр кастомных классов). Добавить в `npm run check` и `quality-gates.yml`. Baseline **не** фиксировать — гейт должен сразу быть красным, это его первое доказательство. | — |
| 2 | **FIX-05-02 · Оживить `lux-*` и мёртвые классы** | Вернуть `.lux-card`/`.lux-input`/`.glass-panel`/`.fade-in-up`/`.histogram-slider-thumb` в `@layer components` (источник — `git show 68c17f9`); `bg-bg-muted`→`bg-muted` (33), `bg-bg-elevated`→`bg-elevated` (6), `border-bg-main` (1); утилиты `.pt-safe/.pb-safe` через уже объявленные `--safe-area-inset-*`. Гейт из FIX-05-01 зеленеет по этим позициям. | 1 |
| 3 | **FIX-05-03 · Опасити кратные 5** | Механическая замена 68 сайтов (`/8`→`/10`, `/12`→`/10`, `/4`→`/5`, `/6`→`/5`, `/2`,`/3`→`/5`) со сверкой на глаз по 6 hero-страницам и админ-пилюлям. | 1 |
| 4 | **FIX-05-04 · Мост токенов** | `primary`/`muted`/`accent`/`card`/`popover` → объектная форма с `foreground` (образец — `destructive`); свернуть 7 обходных `text-[rgb(var(--accent-foreground))]`; `--rose`/`--sky`/`--glass-*` — либо мост, либо удаление вместе с комментарием `globals.css:93`. | 1 |
| 5 | **FIX-05-05 · Контраст** | `--text-placeholder` → ≥4.5:1 в обеих темах; ввести `--border-control` ≥3:1 и перевести на него поля/кнопки/переключатели; `login-client.tsx:557,579` `text-primary`→`text-accent-text`; `destructive` в тёмной поднять до ≥4.5 на `bg-card`; проверить `text-sec` на `bg-page` (4.42). Пересчитать таблицу контраста, приложить к коммиту. | 2 |
| 6 | **FIX-05-06 · Бренд вне Tailwind** | `src/lib/ui/brand-colors.ts` + миграция `email/templates/{otp-code,notification}.ts`, `api/og/profile/route.tsx`, `global-error.tsx`, `public-settings-client.tsx`, `share-profile-section.tsx`. Два генератора постеров свести к одной палитре. | — |
| 7 | **FIX-05-07 · Слои и оверлеи** | Именованная z-шкала; портал для `AuthUserMenu`/`AuthMobileMenu`; `z-[9999]`→`--z-popover`; `admin-sidebar-mobile`→`Drawer side="left"`; лист bottom-nav→`Drawer side="bottom"`; примитив `FullBleedOverlay` (портал + `use-modal-a11y`) для `portfolio-editor`/`stories-viewer` — закрывает `OVERLAY-FULLBLEED-PORTAL-PRIMITIVE`. | — |
| 8 | **FIX-05-08 · Моушен-канон** | `src/lib/ui/motion.ts`; миграция по областям (маркетинг → публичные профили → кабинеты); `@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto } }`. | — |
| 9 | **FIX-05-09 · `Checkbox` + `Alert`** | Компоненты в `src/components/ui/` (за основу — `legal-consent-group.tsx:64`); миграция 14 чекбоксов, начиная с `DeleteAccountModal`. Синхронизировать таблицу SKILL.md §6 с кодом. | — |
| 10 | **FIX-05-10 · Копирайт** | Шаблон ошибок (200 строк, начать с 13 «Не получилось» и 6 «Ошибка API»); ё/е (9 пар); многоточие к `…`; 2 дефиса→тире; «ты»→«вы» (4); ратифицировать «Назад»/«Далее»/«Ещё» как исключение, остальные CTA — под правило. | — |
| 11 | **FIX-05-11 · Расширить `check:ui-text`** | ROOTS на `src/components` + остальные `src/features`; вынести 32 строки в `UI_TEXT`; свести 4 формулировки a11y-ярлыка рейтинга к одной. | 10 |
| 12 | **FIX-05-12 · Форматтеры** | Свести 102 ad-hoc-сайта к `src/lib/ui/fmt.ts` + `src/lib/format.ts`; удалить `admin-cabinet/billing/lib/kopeks.ts` и 5 пер-секционных синглтонов; убрать форматирование денег из `text.ts:920`; одна конвенция сокращений («млн»/«тыс»). ⚠️ tz-часть (`master-step.tsx:109`) согласовать с tz-треком. | — |
| 13 | **FIX-05-13 · Ступени шкалы** | `fontSize` `micro/nano`, `borderRadius` `card/panel/pill` в конфиг; миграция 496+37 произвольных значений; обновить SKILL.md §4/§5. | — |
| 14 | **FIX-05-14 · Один `<main>`** | Поднять признак `isWorkspace` из `app-shell-content.tsx:20-21` в `AppShell` (либо отдать `main` нижним шеллам); снять `<main>` в `blog/faq/gift-cards`; закрепить тестом «ровно один `<main>` в документе» по образцу структурных guard'ов #35/#36. | — |
| 15 | **FIX-05-15 · Фокус и метки форм** | Починить хелпер `Field` (`useId` + `htmlFor`/`id`) → закрывает весь модал услуг; 6 инлайновых оторванных `<label>`; 3 безымянных поля; снять `focus:ring-0`/`focus-visible:ring-0` с 6 полей и дать `stories-rail.tsx:59` кольцо. Делать **после** FIX-05-05 — кольцо должно строиться на новом `--border-control`. | 5 |
| 16 | **FIX-05-16 · OTP и alt** | `otp-input.tsx:112-118` — перефокус только на ввод/вставку, не на любое `value`; `autoComplete="one-time-code"` на все ячейки; `pattern="[0-9]*"`. Протянуть подписи `MediaAsset` в `alt` для ~20 контентных изображений; `aria-label` для `portfolio-editor.tsx:198`; `aria-label` пяти `<nav>`; `tag-input.tsx:90` → `UI_TEXT`. | — |

---

## 🚨 Pre-launch риски, за которыми следить

1. **Провалы контраста на основных читаемых поверхностях.** Placeholder — **2.39:1** в светлой теме на каждом поле продукта (провал WCAG 1.4.3). `text-sec` на `bg-page` — **4.42:1**, чуть ниже порога, а это самый массовый вторичный текст (1526 сайтов `text-text-sec`). `border-subtle` — **1.46/1.17:1** против 3:1 для границ элементов управления. В связке с UI-01 (у полей рамки нет вовсе) граница поля ввода в светлой теме различима на **1.05:1** — практически невидима. Это первое, что увидит боевой пользователь на `/login`.

2. **Регрессии тёмной темы на экранах денег и броней.** `destructive` в тёмной — **3.20:1** на карточке: текст ошибок формы (`marketing-consent.tsx:132`, `public-model-offer-apply.tsx:163`) ниже AA. Статус-пилюли платежей в админке (`payment-status.ts:35-39`) вообще без фона — `bg-emerald-500/12`/`bg-amber-500/12`/`bg-red-500/12` мертвы, различие «оплачено / ожидает / провалено» несёт только цвет текста. Правый край основного CTA-градиента (`primary-magenta`) — **4.21:1** светлая / **3.87:1** тёмная: кнопка «Записаться»/«Оплатить» на конце градиента ниже AA для обычного текста. Гостевой booking-флоу студии и скелетон страницы записи (UI-03) — это прямой конверсионный путь.

3. **Нарушения конвенции ModalSurface — класс повторяющегося бага.** Позиционная часть закрыта (ESLint-гейт живой, 0 warning'ов, exempt-лист обоснован). **Не закрыт a11y-контракт**: `admin-sidebar-mobile.tsx:44-49` объявляет `aria-modal="true"` без focus-trap — ложное обещание AT; лист переключателя ролей в трёх нижних навигациях — модальный bottom-sheet без `role="dialog"`, ESC, trap и scroll-lock; лайтбокс `portfolio-editor.tsx:241` — без ESC и trap. Инвариант #27 обещает эти гарантии «50+ callers наследуют без per-caller кода» — три поверхности вне наследования. Плюс латентный позиционный риск: `TopbarShell` с `backdrop-blur-md` уже в дереве, и одно перемещение компонента внутрь его поддерева воскрешает баг.

4. **Отсутствие ESLint-guard'а для конвенции модалок — ОПРОВЕРГНУТО.** Гейт есть (`eslint.config.mjs:38-55`, GUARDRAILS-01). Следить надо за другим: он **warn**-уровня, а `npm run lint` от warning'ов не падает. Сейчас их 0, но первый новый `fixed inset-0` пройдёт в CI молча. Кандидат на повышение до `error` — теперь, когда база чистая, это бесплатно.

5. **Мёртвые классы проходят все 15 гейтов.** 192 сайта, четвёртый рецидив класса. Пока нет `check:dead-classes` (FIX-05-01), любой фикс из этого отчёта может быть отменён следующим же коммитом, и ни один «✅» в отчётах этого не покажет. Это главный системный риск отчёта: он не про конкретный баг, а про то, что зелёный CI здесь ничего не гарантирует.

6. **Бренд в артефактах, которые покидают продукт.** Письмо с OTP — это боевой канал входа (`PHONE_AUTH_ENABLED` off в проде), и оно приходит в фиолетово-розовой палитре, оставленной месяцы назад. Туда же — OG-превью каждого публичного профиля и постеры, которые мастера выкладывают в соцсети. Эти артефакты живут дольше сессии и правятся не деплоем.

7. **Доступность на пути входа и в главном паттерне кабинета.** `/login` — единственная форма, через которую проходит каждый пользователь: там два вложенных `<main>` (UI-30), OTP-сетка перехватывает фокус и не даёт исправить среднюю цифру (UI-34), а поле ввода не имеет рамки (UI-01) при контрасте placeholder'а 2.39:1 (UI-05). Дальше — inline-edit профиля мастера, главный паттерн кабинета по SKILL.md §7: во всех пяти его строках `focus:ring-0` гасит кольцо фокуса (UI-32), т.е. клавиатурный пользователь не видит, какое поле редактирует. Хорошая новость — фундамент здоров: 82 из 82 иконочных кнопок подписаны, `aria-hidden` на интерактивных элементах нет ни одного, `alt` не отсутствует нигде, focus-trap и return-focus в `ModalSurface`/`Drawer` держатся (инвариант #27). Проблемы точечные и дешёвые.

---

### Context updates

**Не затронуто.** Аудит read-only; схема, роуты, env и core-flows не менялись → структурных триггеров по таблице `docs/QUALITY-GATES.md` § «Обновление контекста» нет. `MASTERRYADOM_AI_CONTEXT.md` и `BACKLOG.md` намеренно не редактировались (последний — из-за четырёх параллельных аудитов; предлагаемые строки собраны в секции выше для мержа владельцем).

Одно наблюдение для будущего рефреша (**применять не здесь** — это находка, а не факт о состоянии контекста): §8 «Известных красных гейтов нет (GATES-FIX-01)» верно по букве, но `npm run check` на этой машине падает на `prisma:generate` с `EPERM` из-за блокировки файла Windows, и из-за `&&`-цепочки шаги 5–15 при этом не выполняются вовсе. Если это воспроизводится не только локально, формулировка «`npm run check` проходит целиком на чистом дереве» вводит в заблуждение.
