# 19 · Моушен: облегчить framer-motion и свести длительности и кривые

**Источник:** `PERF-12` (`docs/audits/AUDIT-FRESH-04-performance.md`), `UI-12` (`docs/audits/AUDIT-FRESH-05-ui.md` § E и «Предлагаемый канонический набор»); планы — `AUDIT-CAMPAIGN-BLOCKED.md`. Попутно закрывает `FRAMER-MOTION-REDUCED-MOTION-SWEEP` (`BACKLOG.md`) · **Тип:** рефакторинг (производительность + дизайн-система) · **Объём:** L
**Зависит от:** — (после 18 удобнее: тот же приём замера бандла). Пересекается по файлам с 10 (тосты — новый код сразу на `m`), 22, 23.

## Что не так
Замер 2026-09-29 (код) и сборки 2026-09-23.

**PERF-12 — вес.**
- `framer-motion` 12.38 импортируют **60 файлов** (было 57), `motion` — 59; `LazyMotion` / `m` / `domAnimation` — 0. JSX `<motion.*>` — 135 (div 81, span 26, section 8, p 7, h1 5, article 3, прочие 5).
- Чанк `83204-*.js` = 126.5 kB parsed / **41.5 kB gzip**, в манифестах **90 из 90** страниц. На каждую страницу его несёт шелл корневого layout'а: `bottom-nav.tsx`, `bottom-tab-bar.tsx`, `cookie-notice.tsx`, `install-prompt.tsx`, `auth-user-menu.tsx`, `auth-mobile-menu.tsx`, `FooterCTA.tsx`, плюс `modal-surface.tsx`, `drawer.tsx`.
- **Возможности вне `domAnimation` — инвентарь заново, и он не совпадает с BLOCKED:**
  | Место | Что | Где работает |
  |---|---|---|
  | `components/layout/bottom-tab-bar.tsx:127` | `layoutId="bottom-tab-indicator"` | общая полоса вкладок — публичная и три кабинетные, т.е. **каждая страница на телефоне** (в BLOCKED — `cabinet-bottom-nav.tsx:42`; код переехал в общий компонент NAV-ALIGN-01) |
  | `notifications/components/notifications-center-page.tsx:746` | `layout` | только `/notifications` |
  | `home/components/stories-viewer-overlay.tsx:260-263` | `drag="y"` + `dragConstraints`/`dragElastic`; `useMotionValue`/`useTransform`/`animate()` (:80-81, :176) | уже ленивый чанк (`stories-viewer-overlay-lazy.tsx:16`) |
  `drawer.tsx` свайп написан на pointer-событиях (:155-164), framer-`drag` не использует; в `master-bottom-nav.tsx:87` `layoutId` — только комментарий. **Следствие:** вариант BLOCKED «`domAnimation` + три острова» в лоб не проходит — первый «остров» стоит в шелле каждой страницы.

**UI-12 — разнобой.**
- **Кривые** (35 файлов с литералом): канон `[0.22,1,0.36,1]` ×21; «второй канон» `[0.25,0.1,0.25,1]` — **15 литералов + 8 файлов с локальной `const EASE = [0.25,0.1,0.25,1]`** (9 употреблений `ease: EASE`) (`marketing/sections/{cta-block,feature-grid,hero-section,pricing-teaser,steps-section,text-with-image}.tsx`, `model-offers/components/{compact-hero,models-top-block}.tsx`) — аудит этих восьми не видел; Material `[0.4,0,0.2,1]` — `auth-user-menu.tsx:127`, `auth-mobile-menu.tsx:183`; `[0.25,0.46,0.45,0.94]` — `app/not-found.tsx:20`, `ui/error-state.tsx:86`; `"easeInOut"` — `faq-accordion.tsx:25,38`, `features-page-client.tsx:241` (+ `otp-input.tsx:300`, намеренно); `"easeOut"` — `catalog-page-client.tsx:990,998`; уход `[0.4,0,1,1]` — `login-client.tsx:100`; `"linear"` — `stories-viewer-overlay.tsx:178` (намеренно).
- **Длительности framer:** 17 ненулевых значений 0.14–0.5 + `1.15` (sweep OTP); `duration: 0` ×41; тернарников `reduce ? { duration: 0 } : {…}` — 39. `staggerChildren` — 8 значений 0.04–0.12. Пружины `type: "spring"` — 6 (нижние навигации, шторки, промпт).
- **Дистанции `y:`** — 14 ненулевых (−8…24 и `80` у `cookie-notice.tsx:55` и `install-prompt.tsx:88` — выезд снизу).
- **Tailwind:** `duration-200` ×23, `-300` ×17 (в т.ч. `Button`, `button.tsx:99`), `-150` ×4, `-500` ×3, `-700` ×1 — 33 файла.
- **hover/press классами** — 17 сайтов в 12 файлах: `hover:scale-105` ×4, `group-hover:scale-[1.03]` ×3, `group-hover:scale-[1.04]` ×2, `hover:-translate-y-0.5` ×2, `hover:scale-110`, `group-hover:-translate-y-1`; `active:scale-95` ×2, `[0.98]`, `[0.99]` (`Button` — на всех кнопках). Пропсами — 3 сайта (`how-it-works-section.tsx:55`, `stories-rail.tsx:55-56`).
- **Смежный дефект (BACKLOG `FRAMER-MOTION-REDUCED-MOTION-SWEEP`):** `initial`, зависящий от `useReducedMotion()`, расходится между сервером (всегда `false`) и клиентом → hydration-mismatch и риск блока с `opacity: 0` у того, кто просил не двигать интерфейс. Вызовов хука — 65.
- **Ловушки для свипа:** `catalog-map.tsx:520,642,644` — `duration: 300` у Яндекс.Карт (миллисекунды); `content` Tailwind (`tailwind.config.js:13-17`) не включает `src/lib/**` — классы, объявленные строками в `src/lib/ui/motion.ts`, скомпилируются «в ничто».

## Что сделать
**Этап 1 — модуль, классы, провайдер** (выкатывается вместе с этапом 2: `strict` бросает на `motion` внутри `LazyMotion`).
1. `src/lib/ui/motion.ts`: `EASE = [0.22,1,0.36,1]`, `EASE_EXIT = [0.4,0,1,1]`; `MOTION.micro` / `.base` / `.section` — готовые объекты перехода `{ duration: 0.18 | 0.28 | 0.45, ease: EASE }` (гейт reduced-motion оборачивал весь объект, поэтому модуль отдаёт объекты, а не числа) + `MOTION.exit` (`0.18`, `EASE_EXIT`); `SPRING_SHEET` (одна пружина вместо шести); `STAGGER = 0.08`; `DISTANCE = { rise: 16, nudge: 6 }`; `VIEWPORT_ONCE = { once: true, margin: "-80px" }`. Кортежи типизированы в модуле — касты `as [number, …]` на местах уходят.
2. `src/components/ui/motion-classes.ts` (внутри `content` Tailwind): `HOVER_LIFT` (`transition-transform duration-200 hover:-translate-y-0.5`), `IMAGE_ZOOM` (`transition-transform duration-500 group-hover:scale-[1.03]`), `PRESS` (`active:scale-[0.97]`); в `tailwind.config.js` — `transitionTimingFunction.brand = "cubic-bezier(0.22, 1, 0.36, 1)"` (`ease-brand`). Канон hover/press — **классами**, не `whileHover`/`whileTap`: пропсы добавили бы потребителей framer.
3. `src/components/providers/motion-provider.tsx` (`"use client"`): `<LazyMotion features={domAnimation} strict><MotionConfig reducedMotion="user" transition={MOTION.base}>`; монтировать в `src/app/layout.tsx` внутри `<body>` рядом с `SWRProvider`. `reducedMotion="user"` — фреймворк сам гасит transform- и layout-анимации тем, кто просил, прозрачность оставляет.

**Этап 2 — `motion` → `m` и острова** (атомарно: пока жив один `motion`, полный набор в бандле).
1. **Индикатор нижней полосы без `layoutId`:** одна полоса на `<ul>` в `bottom-tab-bar.tsx`, сдвиг `translateX(index × 100%)` классами `transition-transform duration-300 ease-brand motion-reduce:transition-none`; вкладки равной ширины (`w-full`), активный индекс — из пропа `active` детей. Выглядит так же (полоса едет), framer не нужен.
2. `/notifications`: вложенный `<LazyMotion features={loadDomMax}>` с асинхронной загрузкой (`src/components/providers/motion-dom-max.ts` = `export { domMax as default } from "framer-motion"`) — `domMax` уезжает в чанк этой страницы. Не подхватит `layout` на живой проверке — см. «Решения владельца», п. 2.
3. `stories-viewer-overlay.tsx`: `<LazyMotion features={domMax}>` внутри уже ленивого модуля; `animate()` и motion-values не трогать.
4. Кодмод 60 файлов: `motion` → `m` в импорте, `<motion.X` / `</motion.X>` → `<m.X` / `</m.X>` (форм `motion(...)` / `motion.create` — 0).
5. Сторож `src/lib/ui/motion-imports.test.ts` (разбор импортов компилятором, как `prisma-enums.test.ts`): (а) value-импорт `motion` из `framer-motion` в `src/` — 0; (б) `domMax` и `LazyMotion` — только в реестре с причиной (`motion-provider.tsx`, `motion-dom-max.ts`, `stories-viewer-overlay.tsx`, `notifications-center-page.tsx`); (в) пропсы `layout` / `layoutId` / `drag` на `<m.*>` — только в файлах-островах. Слепая форма (назвать в шапке): пропсы через спред. `@probe`: вернуть `import { motion }` в `home/components/hero-section.tsx` → (а) с именем файла; вернуть `layoutId` в `bottom-tab-bar.tsx` → (в).

**Этап 3 — канон по областям**, коммит на область с визуальной приёмкой: `home/` + `marketing/` + `model-offers/` (весь «второй канон», 23 сайта) → `public-profile/`, `public-studio/`, `catalog/`, `booking/` → кабинеты и `admin-cabinet/` → `components/ui/`, `components/layout/`, `app/`. Правила:
- тернарник `reduce ? {duration:0} : {…}` → `MOTION.<ступень>`; `initial`, зависевший от `reduce`, — безусловный (`{ opacity: 0, y: DISTANCE.rise }`) — это и снимает hydration-mismatch. `useReducedMotion` оставить только там, где решение не про transform: `drag` сториз, бесконечный sweep `otp-input.tsx`, автоплей;
- 0.14–0.2 → `micro`, 0.22–0.32 → `base`, 0.35–0.5 → `section`, уход/сворачивание → `exit`; `y` ≥ 10 → `rise`, < 10 → `nudge`, выезд снизу (`y: 80`) → `"100%"`; `staggerChildren` → `STAGGER`;
- Tailwind: 150/200/300 → `duration-200`, 500/700 → `duration-500`; карточки → `HOVER_LIFT`, фото в карточке → `IMAGE_ZOOM`, иконки-кнопки → `PRESS` без hover-масштаба (SKILL §9: hover не должен отвлекать);
- не трогать: `otp-input.tsx:300` (1.15 s ∞ под `!reduce`), `stories-viewer-overlay.tsx:178` (`linear` прогресса), `catalog-map.tsx:520,642,644` (Яндекс.Карты), CSS keyframes логина `globals.css:904-921`. Свип `duration:` — только внутри объектов перехода, не по файлу.

**Этап 4 — сторож канона** `src/lib/ui/motion-canon.test.ts` (разбор — `src/lib/testing/source-scan.ts`, GUARD-INTEGRITY п. 6): литеральные `ease:` и `duration: <число ≠ 0>` в объектах перехода вне `src/lib/ui/motion.ts` запрещены; инвентарь заморожен на начало этапа 3 и падает на росте, к концу — только реестр (два намеренных сайта). `@probe`: `ease: [0.25, 0.1, 0.25, 1]` в `faq-item.tsx` → красный с сайтом; тот же литерал через соседнюю константу (`const E = [...]; ease: E`) → тоже красный — именно так жили восемь файлов.

## Решения владельца
1. **Общий набор движения** — меняет ощущение всего продукта разом: 3 длительности 0.18 / 0.28 / 0.45 с, одна кривая, дистанции 16 / 6 px, подъём карточки 2 px, увеличение фото 1.03, нажатие 0.97. У `Button` сейчас нажатие 0.99 на всех кнопках. **Рекомендация:** набор принять; `Button` оставить 0.99 (крупным кнопкам 0.97 даёт заметный «провал»), 0.97 — для карточек и иконок. Последствие: ~40 экранов меняют темп появления, приёмка — глазами.
2. **`/notifications`, если вложенный `LazyMotion` не подхватит `layout`:** (а) убрать плавную перестройку списка при фильтре — **рекомендация**; (б) `domMax` глобально — плюс ~10 kB gzip на каждой странице ради одной анимации.

## Готово, когда
- `import { motion }` из `framer-motion` — 0; `<motion.` — 0; `LazyMotion strict` в корне; `domMax` только в чанках сториз и `/notifications`.
- Сборка: framer в first-load `/` ≤ 22 kB gzip (сейчас 41.5; ориентир документации framer — `m` 4.6 kB + `domAnimation` ~15 kB).
- Литералов кривой/длительности вне модуля — только реестр; `[0.25,0.1,0.25,1]` — 0; различных длительностей framer — 3 ступени + намеренные.
- При эмуляции reduced-motion на `/u/anna-sokolova` — 0 hydration-предупреждений (по BACKLOG было 5) и ни одного блока с `opacity: 0`.
- SKILL `ui-ux-pro-max` §9 переписан в том же изменении.

## Проверка
- **Бандл до/после:** `npm run analyze`; скрипт по манифестам (приём спеки 18) — чанк framer на `/`, `/catalog`, `/u/[username]`, parsed/gzip; `domMax` (модули projection/drag в analyze) не в общем чанке.
- Гейты `typecheck`, `lint`, `check:encoding`, `check:mojibake`, `check:dead-classes` (ловит классы вне `content`), `npm run test`.
- **Живая — обязательна** (тихий no-op автотестами не ловится): прод-сборка, телефон 375 и ПК 1280, светлая и тёмная. Бывшие «острова»: полоса нижней навигации едет между вкладками (гость, мастер, студия, клиент); `/notifications` — список перестраивается при фильтре; сториз — свайп вниз закрывает. По области этапа 3 — появление секций, модалки, шторки, меню, промпты. Затем то же с `page.emulateMedia({ reducedMotion: "reduce" })`: без сдвигов, консоль без hydration-предупреждений.

## Документы
- `AUDIT-CAMPAIGN-BLOCKED.md` — PERF-12 и UI-12 закрыты, поправка про «острова»; `AUDIT-CAMPAIGN-PROGRESS.md` — две строки.
- `BACKLOG.md` — удалить `FRAMER-MOTION-REDUCED-MOTION-SWEEP` (если этап 3 прошёл все области); `BACKLOG-DONE.md` — строки.
- Скилл `ui-ux-pro-max` §9 — `MOTION`, классы из `motion-classes.ts`, `m` вместо `motion`, правило `reducedMotion="user"` (иначе следующий агент вернёт `whileHover` и `motion.div`).
- **Контекст (триггер «новый `src/lib/*` модуль»):** §3 — строка про `src/lib/ui/motion.ts` и `MotionProvider`.

## Риски
- **`strict` бросает в рантайме** на пропущенном `motion` — белый экран маршрута; держат сторож (а) и живой обход.
- **`m` без нужной фичи — тихий no-op** (`layout`, `drag`): сторож (в) + живая проверка трёх мест.
- **`reducedMotion="user"`** меняет поведение для тех, у кого reduce: вместо мгновенного — плавная прозрачность без сдвига. Корректно по WCAG, но видно.
- Ощущение всего продукта меняется одним заходом — приёмка владельцем по областям, не одним скриншотом.
- Кодмод и спеки 10 / 22 / 23 правят те же файлы — не вести параллельно в одной области.
