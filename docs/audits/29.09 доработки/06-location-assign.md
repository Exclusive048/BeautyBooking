# 06 · `window.location` на внутренние адреса → роутер или объяснённое исключение

**Источник:** `NEXT163-LOCATION-ASSIGN` (BACKLOG) · **Тип:** рефакторинг · **Объём:** S
**Зависит от:** —

## Что не так
Замер 2026-09-29: `npx eslint src -f json` — ровно 4 срабатывания правила `@next/next/no-location-assign-relative-destination` (плюс 25 фоновых `no-unused-vars`, к делу не относятся), все — warning, `npm run lint` выходит 0:

| Место | Куда | Вердикт |
|---|---|---|
| `src/features/auth/components/logout-button.tsx:31` | `/` после выхода | **намеренно**: полная перезагрузка сбрасывает кэш SWR и данные прежнего пользователя; обоснование уже в комментарии `:28-30` |
| `src/lib/http/fetch-with-auth.ts:48` | `/login?next=` после 401 от обновления сессии | **намеренно**: функция-модуль без доступа к роутеру (не хук), вход устарел — клиентский стейт прежней сессии надо сбросить; SESSION-LOSS-01 (`:1-9`) |
| `src/features/client-cabinet/profile/client-profile-page.tsx:241` (в бэклоге `:236`, строка съехала) | `/api/auth/vk/start` | **намеренно**: это route handler с OAuth-редиректом к провайдеру, а не страница — `router.push` на него не годится |
| `src/features/hot-slots/components/hot-slots-subscribe-button.tsx:81` | `/login?next=…` для гостя | **долг**: обычный переход на страницу — нужен `useRouter().push()` |

Той же формы, но правилом не видно (адрес в переменной):
- `src/features/model-offers/components/public-model-offer-apply.tsx:87` — `window.location.href = loginHref` (переход гостя на вход) — **долг**, как у горячих окошек.
- `src/app/login/login-client.tsx:350` — `window.location.replace(target)` после входа — **намеренно**: новая сессия должна дойти до серверных компонентов корневого layout (шапка), мягкая навигация их не перерисует.
- `src/features/billing/components/billing-page.tsx:328,367` — `confirmationUrl` ЮKassa, внешний адрес — корректно.

`vk-notifications.tsx`, упомянутый в бэклоге, `window.location` больше не использует (подтверждено грепом).

## Что сделать
1. `hot-slots-subscribe-button.tsx:79-82`: `const router = useRouter()` (`next/navigation`), `router.push(\`/login?next=${next}\`)`.
2. `public-model-offer-apply.tsx:85-89`: так же `router.push(loginHref)`; проверка `typeof window` больше не нужна (обработчик клика).
3. Три намеренных места — `// eslint-disable-next-line @next/next/no-location-assign-relative-destination -- <почему>` одной строкой, со ссылкой на уже существующее обоснование: logout — «полная перезагрузка сбрасывает SWR и данные прежнего пользователя»; fetch-with-auth — «модуль без роутера; вход устарел, стейт прежней сессии сбрасывается»; client-profile — «route handler OAuth, не страница». У `login-client.tsx:350` правило не срабатывает — добавить короткий комментарий «полная загрузка — чтобы новая сессия дошла до серверной шапки» (сейчас там комментарий только про таймер).
4. **Сторож:** в `eslint.config.mjs` поднять правило до `"error"` отдельным блоком рядом с GUARD-INTEGRITY (`:45-68`) — по инв. #43 warning ничего не останавливает (`lint` выходит 0 при любом числе warning'ов). Блок `@probe` в комментарии: «добавить `window.location.href = "/cabinet"` в любой клиентский компонент → `lint` exit 1, текст `Do not use window.location.href to navigate to internal Next.js pages`». Неиспользованная `eslint-disable`-строка при последующей правке места подсветится сама (`reportUnusedDisableDirectives` по умолчанию в ESLint 9).
5. Слепая зона правила (адрес в переменной, `location.replace`) — назвать в том же комментарии конфига; гейт под неё не заводить (регексп по тексту здесь был бы вакуумным сторожем, инв. #43).

## Решения владельца
Не нужны.

## Готово, когда
- `npx eslint src` не выдаёт ни одного `no-location-assign-relative-destination`; правило на уровне `error`, проба выполнена и записана.
- Гость, нажавший «Подписаться на горящие окошки» и «Откликнуться» на модель-оффер, уходит на `/login?next=…` без полной перезагрузки и после входа возвращается на исходную страницу.
- Выход, протухшая сессия и привязка ВК ведут себя как раньше.

## Проверка
- `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake`.
- Живая проверка: гостем — `/u/<анна>` → «Подписаться» на горящие окошки → `/login?next=/u/<анна>` → вход → возврат; `/models/<оффер>` → «Откликнуться» → вход → возврат; клиентом Еленой — «Выйти» (шапка без имени сразу), «Привязать ВК» в профиле (уходит на VK). Телефон и ПК; темы не затрагиваются.

## Документы
- BACKLOG: удалить `NEXT163-LOCATION-ASSIGN`. BACKLOG-DONE: строка.
- Контекст: абзац в §2 («Новое предупреждение линтера от 16.3.0… заведено в BACKLOG как `NEXT163-LOCATION-ASSIGN`») после удаления пункта станет ссылкой в никуда — заменить одной фразой: правило поднято до `error`, три намеренных места помечены с причиной. Правка факта в том же изменении.

## Риски
- `router.push('/login?next=…')`: страница входа — клиентская, сессии в момент перехода нет, так что сбрасывать нечего; после входа `login-client.tsx` сам делает полную загрузку.
