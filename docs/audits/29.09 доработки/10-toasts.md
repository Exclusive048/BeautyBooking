# 10 · Тосты вместо `window.alert`

**Источник:** `RES-18` (`AUDIT-CAMPAIGN-BLOCKED.md`) · **Тип:** доработка · **Объём:** M
**Зависит от:** — (спека 11 зависит от этой). С 21 (z-index) — согласовать слой.

## Что не так

**Общей системы коротких сообщений нет.** В `src/components/ui/` нет ни тоста, ни провайдера; зависимостей вроде `sonner` нет. Вместо неё — три разных приёма:

1. **`window.alert()` — 11 вызовов в 6 файлах** (в RES-18 было 13 в 7; все оставшиеся — в кабинете мастера):
   - `features/master/components/services/row-menu.tsx:50` (не удалось изменить видимость), `:74` (у услуги есть записи — `SERVICE_HAS_BOOKINGS`), `:76` (не удалось удалить);
   - `features/master/components/services/reorder-controls.tsx:34` (не удалось переставить);
   - `features/master/components/portfolio/portfolio-card.tsx:129` (любое действие над работой);
   - `features/master/components/model-offers/offer-actions-row.tsx:70` (закрыть оффер), `:93` (в архив);
   - `features/master/components/model-offers/application-actions-island.tsx:52` (одобрить отклик);
   - `features/master/components/account/security/sessions-card.tsx:54` («у вас только эта сессия»), `:68` (ошибка), `:75` (успех: «завершено N сессий»).

   Ни один из 11 не работает как «гейт»: результат `alert` нигде не читается, после него — `return` или `router.refresh()`. Подтверждения («вы уверены?») уже идут через `useConfirm` / `ConfirmModal`. Значит, замена на тост не меняет порядок действий — меняется только то, что окно не блокирует страницу. Остальные `alert(` в `src/` — не браузерные: `lib/alerting.ts:19` (серверная функция оповещения, её зовёт `lib/public-urls.ts:54`) и строки в тестах.

2. **Самодельные «тосты» — 11 копий.** Девять — `useState` + `setTimeout` на 2,4 с + блок в потоке страницы: админка — `billing/.../payments-tab.tsx:44`, `billing/.../plans-grid.tsx:37`, `billing/.../subscriptions-table.tsx`, `catalog/.../catalog-table.tsx`, `cities/.../cities-table.tsx`, `reviews/.../reviews-list.tsx`, `users/.../users-table.tsx`; плюс `notifications/components/notifications-center-page.tsx:320` (`actionNotice`) и `home/components/home-feed.tsx:58` («аккаунт удалён»). Все рисуются в потоке страницы (если пользователь прокрутил — не видно), ошибки объявляются как `role="status"` (вежливо, а не как `alert`), а 2,4 с — мало, чтобы прочитать фразу из десяти слов. Цвета — сырые `emerald-*`/`red-*` с `dark:`-вилками вместо статусных токенов. Ещё две — плавающие, в `client-cabinet/profile/client-profile-page.tsx:284` (`stubMessage`: отказ подключения ВК) и `:299` (`tgResult`: итог подключения Telegram): `fixed bottom-6 … z-50`, то есть на телефоне садятся на нижнюю навигацию, крестик — сырой `<button>` с символом «×» без `aria-label`.

   Попутно там же: кнопка удаления аккаунта в профиле клиента (`client-profile-page.tsx:277–280`, локальный `DangerZoneCard` на `:810`) показывает заглушку «Удаление аккаунта скоро появится» — литералом мимо `UI_TEXT`, хотя удаление работает в `/cabinet/settings` (`features/cabinet/components/delete-account-section.tsx`).

3. **Тихие отказы — действие пользователя не удалось, а сообщения нет:**
   - `features/booking/components/booking-flow/booking-flow-stepper.tsx:498–518` — отмена записи из экрана успеха: при `!res.ok` ничего не происходит, `catch` пустой;
   - `features/client-cabinet/notifications/client-notifications-page.tsx` — «Очистить прочитанные» (`:162`, пустой `catch`), «Прочитать все» (`:195`, отказ сервера не проверяется), переключение «прочитано» (`:135`, откат без слова);
   - `features/master/components/notifications/mark-read-button.tsx:33` — в комментарии прямо: «Surface failures via the global toast in a follow-up»; `mark-all-read-button.tsx:25` — отказ не проверяется;
   - фоновые пометки «прочитано» при открытии страницы (`notifications-center-page.tsx:379/407`, `client-notifications-page.tsx:175`) — тишина здесь правильная, но `:175` — `void fetch(...).then(...)` без `.catch`: обрыв сети даёт необработанный отказ промиса.

Уведомления о событиях в колокольчике (`components/notifications/notifications-bell.tsx:176`, карточки справа сверху с кнопками «Подтвердить»/«Открыть») — отдельная система с действиями, в эту спеку не входит.

## Что сделать

Три коммита, порядок важен: тихие отказы — единственная настоящая дыра, её закрывать вторым, сразу за примитивом.

### Коммит 1. Примитив (без потребителей)

Перед работой — скилл `ui-ux-pro-max`.

- `src/components/ui/toast-store.ts` — чистое ядро без React: очередь, `add` (возвращает id), `dismiss`, пауза/продолжение таймера, не больше 3 одновременно (старейший уходит), одинаковый текст с тем же тоном в течение 1 с не дублируется (двойной клик). Длительность: `success`/`info` — 4 с, `error` — 7 с.
- `src/components/ui/toast.tsx` (`"use client"`): `ToastProvider` (контекст + стор) и `ToastViewport` (разметка), хук `useToast()` → `{ success(text), error(text), info(text), dismiss(id) }`. Сообщение — только строка из `UI_TEXT` или курируемая строка сервера (спека 11); JSX внутрь не принимаем.
- **Доступность.** Две живые области рендерятся всегда, даже пустые (иначе первое сообщение не озвучится): `role="status"` (`aria-live="polite"`) для `success`/`info` и `role="alert"` для `error`. Фокус тост не забирает. Кнопка «Закрыть» — `<Button variant="ghost" size="icon" aria-label={UI_TEXT.common.close}>` с иконкой `X` (зона нажатия 44px из UI-29). Таймер останавливается при наведении и при фокусе внутри тоста (WCAG 2.2.1).
- **Вид** (обе темы — токенами, без `dark:`): `rounded-2xl border border-border-subtle bg-bg-card shadow-hover px-4 py-3 text-sm text-text-main`, слева иконка lucide 20px: `CheckCircle2` `text-success-text`, `AlertCircle` `text-danger-text`, `Info` `text-info-text`. Статусные поверхности (`bg-success-surface` и т.п.) не брать: у них альфа в тёмной теме, поверх контента текст читается хуже.
- **Место.** Телефон — снизу над нижней навигацией: `fixed inset-x-4 bottom-[calc(max(var(--bottom-nav-h,0px),env(safe-area-inset-bottom,0px))+12px)] mx-auto max-w-md`; `lg:` — `lg:inset-x-auto lg:right-6 lg:bottom-6 lg:mx-0 lg:w-[360px]`. Снизу, а не сверху: сверху справа уже живут карточки колокольчика и полоса «нет сети» (`network-banner.tsx`). Слой — выше модалки (`z-50`), чтобы ошибка из окна была видна поверх затемнения: `z-toast` (70) из спеки 21, если она уже сделана, иначе `z-[70]` — спека 21 переведёт на токен. Липкие элементы телефона (CTA «Записаться» `z-30`, подсказка «Первые шаги» `z-40`, `bottom-[…+12px]`) тост перекрывает на время показа — это допустимо.
- **Движение:** framer-motion, `AnimatePresence` + `motion.li`, появление `{ opacity: 0, y: 8 } → { opacity: 1, y: 0 }`, уход — `opacity: 0`, `duration: 0.25`, `ease: [0.22, 1, 0.36, 1]`; при `useReducedMotion()` — только прозрачность.
- **Подключение:** `ToastProvider` в `src/app/layout.tsx` внутри `ThemeProvider`/`ViewerTimeZoneProvider`, оборачивая `AppShell` и `BottomNav`. Портал не нужен: область и так прямой потомок `body`-дерева, предков с `transform` нет (если всё же выбрать `createPortal` — он обязан идти за `useIsHydrated()`, это проверяет `components/ui/portal-hydration-gate.test.ts`).
- `data-testid`: `toast-region`, `toast-item` — строка в `.qa/TESTIDS.md`.
- Скилл `ui-ux-pro-max`, раздел 6 (таблица компонентов) — строка «Короткое сообщение → `useToast()`»; раздел 16 — короткий паттерн «когда тост, а когда сообщение в форме» (ошибка поля и отказ сабмита формы — в форме рядом с кнопкой; итог действия, после которого экран меняется или закрывается, — тост).

### Коммит 2. Тихие отказы

- `booking-flow-stepper.tsx` — `toast.error(…cancelFailed)` при `!res.ok` и в `catch` (ключ из того же раздела `UI_TEXT`, что у шага, либо новый).
- `client-notifications-page.tsx` — ошибка у трёх действий пользователя; `:175` — добавить `.catch(() => {})` (фон остаётся тихим).
- `mark-read-button.tsx`, `mark-all-read-button.tsx` — `toast.error`, проверка `res.ok`; удалить комментарий «follow-up».
- Фоновые пометки в `notifications-center-page.tsx` не трогать — тишина там осознанная (сообщение при каждом открытии страницы было бы шумом); оставить комментарий с причиной.

### Коммит 3. Замена `alert` и самодельных тостов

- 11 вызовов `window.alert` → `toast.error(...)`, кроме `sessions-card.tsx:54` → `toast.info` и `:75` → `toast.success`. Тексты те же ключи `UI_TEXT`; выбор «серверная строка или своя» — в спеке 11, здесь не менять.
- 11 самодельных тостов → `useToast()`; удалить их `useState`/`setTimeout`/разметку и локальные типы `Toast`. `home-feed.tsx` — `toast.success(UI_TEXT.home.accountDeleted)` в том же эффекте, что снимает `?deleted=1`; `client-profile-page.tsx` — итоги подключения ВК и Telegram (`?vk=`/`?telegram=`) — `toast.error`/`toast.success` в эффекте, который уже чистит адрес.
- Заглушку удаления аккаунта в профиле клиента заменить ссылкой на раздел удаления в `/cabinet/settings` (кнопка `asChild` + `Link`), литерал убрать.
- Не трогать: `guest-manage-page.tsx:49` — постоянное сообщение о состоянии записи на странице, а не всплывающее.
- **Сторож:** в `eslint.config.mjs` отдельным блоком для `**/*.{ts,tsx}` — встроенное правило `"no-alert": "error"` (не `warn`: правило 5 GUARD-INTEGRITY). Именно `no-alert`, а не ещё один селектор в `no-restricted-syntax`: блок исключений ниже в конфиге выключает `no-restricted-syntax` целиком для `portfolio-card.tsx` и `row-menu.tsx` — ровно для двух файлов, где сегодня живут `alert`. `no-alert` учитывает затенение имён, поэтому `confirm` из `useConfirm()` и импортированный `alert` из `lib/alerting.ts` он не трогает. В комментарии к правилу — блок `@probe` и слепая форма: `const a = window.alert; a(...)` правило не видит.

## Решения владельца

(а) **Вид и поведение тоста.** Варианты: 1) по умолчанию из этой спеки — снизу, над навигацией на телефоне и справа снизу на ПК, до трёх штук, 4 с / ошибка 7 с, закрываются крестиком, пауза при наведении; 2) задать своё. **Рекомендация — 1.** Последствие любого выбора — только константы в `toast-store.ts`.

(б) **Судьба 11 `alert`** — вопрос RES-18 снят разбором выше: ни один не гейт, все — сообщения об итоге. Рекомендация — заменить все. Единственное место на усмотрение: `sessions-card.tsx:54` («у вас только эта сессия») — либо тост по нажатию (как сейчас, только без блокировки), либо кнопка неактивна с подписью. Рекомендация — тост: не меняет раскладку карточки.

(в) **11 самодельных тостов** (админка, центр уведомлений, главная, профиль клиента) — переводить в этой спеке (рекомендация: да — копии разойдутся снова, 2,4 с не хватает на чтение, а две плавающие на телефоне закрыты навигацией) или отдельной задачей.

## Готово, когда

- `grep -rn "window.alert\|alert(" src --include=*.tsx` находит только тесты и `lib/alerting.ts`/`lib/public-urls.ts`; `npm run lint` краснеет на новом `window.alert`.
- Самодельных тостов нет: `grep -rn "setToast\|showToast\|setActionNotice\|setStubMessage" src/features` пуст (колокольчик — отдельная система).
- Кнопка удаления аккаунта в профиле клиента ведёт в настройки, заглушки нет.
- Шесть тихих отказов (4 файла) показывают ошибку; фоновые пометки не дают необработанных отказов промиса.
- Тост виден и не перекрыт нижней навигацией на телефоне, справа снизу на ПК, в обеих темах; озвучивается экранным диктором (ошибка — сразу, успех — вежливо).

## Проверка

- **Тесты:** `src/components/ui/toast-store.test.ts` — поведение ядра на фейковых таймерах: авто-скрытие по тону, пауза и продолжение, лимит 3, дедуп в пределах 1 с, `dismiss`. `src/components/ui/toast.test.ts` — `renderToStaticMarkup` (прецедент — `components/layout/app-shell-landmark.test.ts`, jsdom в проекте нет): обе области есть при пустом списке; ошибка попадает в `role="alert"`, успех — в `role="status"`.
- **Проба сторожа (@probe):** вернуть `window.alert(E.errorMessage)` в `reorder-controls.tsx` → `npm run lint` exit 1 с `no-alert`; то же с `alert(...)` без `window.` и с `globalThis.alert(...)` — записать, какие формы краснеют, и слепую форму. Проба ядра: убрать паузу по наведению → краснеет тест паузы.
- **Гейты:** `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake && npm run check:ui-text && npm run check:dead-classes`.
- **Живая:** мастер — услуги (удалить услугу с записями → тост «есть записи»), портфолио (ошибка при отключённой сети), сессии (успех); клиент — уведомления («Очистить прочитанные» при отключённой сети); админ — города (успех и ошибка); гость — отмена с экрана успеха записи. Телефон 375px и ПК 1280px, светлая и тёмная тема; ошибка изнутри открытого окна видна поверх затемнения; `prefers-reduced-motion` — без сдвига.

## Документы

- `AUDIT-CAMPAIGN-BLOCKED.md` — RES-18 отметить закрытым со ссылкой на коммиты; `AUDIT-CAMPAIGN-PROGRESS.md` — статус находки.
- BACKLOG-DONE — строка «RES-18 — тосты: примитив, 6 тихих отказов, 11 `alert`, 11 самодельных копий; `no-alert` = error».
- `.qa/TESTIDS.md` — `toast-region`, `toast-item`. Скилл `ui-ux-pro-max` — разделы 6 и 16.
- Контекст — §3 «Ключевые паттерны», одна строка про `useToast` (новый модуль `src/components/ui/toast*` — триггер «новый модуль», rule 15).

## Риски

- Тост и модалка: фокус заперт в окне, поэтому крестик тоста недоступен с клавиатуры, пока окно открыто. Сообщение уходит само; для ошибок, требующих действия внутри окна, тост не подходит — там ошибка остаётся в форме (паттерн из раздела 16).
- Тост после `router.refresh()` переживает перерисовку только потому, что провайдер в корневом layout; перенос провайдера ниже (в шелл кабинета) сломает сообщения на границе навигации.
- `no-alert` также запрещает `confirm`/`prompt` — сейчас нарушений нет (заменены `ConfirmModal`/`PromptModal`), это желательный побочный эффект.
