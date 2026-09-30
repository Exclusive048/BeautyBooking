# 04 · Уход мастера из студии и исключение — интерфейс

**Источник:** `STUDIO-LEAVE-UI` (BACKLOG) · **Тип:** доработка · **Объём:** M
**Зависит от:** 01 (формулировки «команда «…»» в уведомлениях — не обязательно, но тексты лучше согласовать)

## Что не так
- Серверное правило есть: `findStudioLeaveBlock` (`src/lib/studio/leave-guard.ts:51-65`) → 409 `MASTER_HAS_STUDIO_BOOKINGS` с числом в тексте и `details.count`; стоит на всех путях отвязки (`transfer-master.ts:76`, `studios/masters.ts:186`, `api/studios/[id]/leave/route.ts:86`).
- Интерфейса нет ни у мастера, ни у студии: grep по `src/features`, `src/components` не находит вызовов `leave-studio`, `members/…/remove`, `DELETE /api/studios/{id}/masters`, `/api/studios/{id}/leave`. Тексты заготовлены и не подключены: `UI_TEXT.master.profile.leaveStudio.*` (`src/lib/ui/text.ts:4714-4726`), `master.profile.errors.leaveStudio` (`:4522`), `studioCabinet.team.remove*` + `transferServices*` (`:6949-6956`).
- Живые роуты, на которые садится интерфейс:
  - мастер: `POST /api/cabinet/master/leave-studio` (`src/app/api/cabinet/master/leave-studio/route.ts`) — уходит профиль в студии (`:30-31`), `transferServices` (по умолчанию `true`) копирует студийные услуги в личный прайс, владелец получает `STUDIO_MEMBER_LEFT` (`:67-82`);
  - студия: `POST /api/cabinet/studio/members/[memberId]/remove` (`memberId` = `Provider.id` профиля в студии) — тот же `transferMasterOutOfStudio(…, "STUDIO")`. ⚠️ Студию он выбирает сам — `resolveCurrentStudioForAdmin` (`:18-44`, «первая по `createdAt`»), а кабинет студии — `resolveCurrentStudioAccess` (`src/lib/studio/current.ts:18-48`, ранжирование ролей): у пользователя с двумя студиями они могут разойтись → 409 `STUDIO_MISMATCH` вместо удаления.
  - ещё два пути отвязки без вызывающих: `DELETE /api/studios/[id]/masters` (`detachMasterFromStudio` — без переноса услуг и отзыва приглашений) и `POST /api/studios/[id]/leave`.
- Исключённый мастер ничего не узнаёт: уведомления об исключении нет (`STUDIO_MEMBER_LEFT` шлётся только владельцу при уходе, `studio-notifications.ts:361-381`).

## Что сделать

### Кабинет мастера — «Выйти из студии»
1. Данные: `getMasterAccountView` (`src/lib/master/account-view.service.ts:71`) — поле `studioMembership: { studioName: string; blockingBookings: number } | null`. Профиль в студии — `listStudioMasterProfiles` / `getMasterWorkProfiles` (`src/lib/master/access.ts`); до разделения — личный профиль со `studioId`. Число — `prisma.booking.count({ where: studioMasterBlockingBookingsWhere(studioProviderId, [profileId]) })` (экспорт `leave-guard.ts:32`) — то же правило, что у сервера.
2. Карточка `StudioMembershipCard` в `src/features/master/components/account/account/`, вставить в `AccountTab` (`…/tabs/account-tab.tsx`) между `RolesCard` и `ExportCard`; только при `studioMembership`. Общие `Card`, `Button` (вариант `danger` для «Выйти из студии»), тексты — `leaveStudio.*` (заголовок «Вы работаете в составе студии», название студии — «Команда «{name}»» по спеке 01 или «В студии «{name}»»). При `blockingBookings > 0` — строка «Будущих записей в студии: N — попросите администратора студии перенести их или отменить» (новый ключ) и ссылка «Открыть записи» → `/cabinet/master/bookings` (канбан показывает их с пометкой «Студия «…»»); кнопку не блокировать — сервер решает.
3. Подтверждение — `FormDialog` (`src/components/ui/form-dialog.tsx`, как `pause-master-dialog.tsx`): `modalTitle`, `modalDescription`, `Checkbox` «Перенести услуги студии в мой прайс» (`transferServicesLabel`/`Hint`, по умолчанию включён), кнопка `leaveAction`/`leaving`. Запрос — `fetchJson('/api/cabinet/master/leave-studio', { method: 'POST', body: { transferServices } })`. Ошибка — `serverMessageOr(error, T.errors.leaveStudio)`: 409 `MASTER_HAS_STUDIO_BOOKINGS` показывается дословно (действенный отказ, FIX-C8). Успех — закрыть, `useRevalidateMe()` + `router.refresh()`.

### Кабинет студии — «Удалить из студии»
4. Сервер: `members/[memberId]/remove` — принимать `studioId` в теле и проверять `ensureStudioRole({ studioId, userId, allowed: [OWNER, ADMIN] })`, как `PATCH /api/studio/masters/[id]` (`src/app/api/studio/masters/[id]/route.ts:62-66`); `resolveCurrentStudioForAdmin` удалить. Отказать 409, если `memberId` — собственный профиль вызывающего (`isCurrentUser`): владельцу, работающему мастером, выходить — из своего кабинета мастера.
5. `MasterDetailHeader` (`src/features/studio-cabinet/masters/components/master-detail-header.tsx:145-171`): для ACTIVE и DISABLED (не INVITED — там «Отозвать приглашение»; не `isCurrentUser`) рядом с «Пауза» — кнопка `danger` «Удалить из студии» (иконка `UserMinus`). Новый `RemoveMasterDialog` по образцу `pause-master-dialog.tsx`: заголовок `removeTitle` с именем, `Checkbox` «Сохранить мастеру его услуги» (`transferServices`, по умолчанию включён), запрос `{ studioId, transferServices }`. Тексты `studioCabinet.team.remove*` перенести в `studioCabinet.mastersV2.removeDialog` + `mastersV2.actions.remove` (рядом с `pauseDialog`, `text.ts:8095`), осиротевшие ключи `team.*` удалить.
6. При 409 `MASTER_HAS_STUDIO_BOOKINGS` — серверный текст дословно (`serverMessageOr`) и ссылка «Открыть календарь мастера» → `/cabinet/studio/calendar?master=${detail.viewToken}` (тот же непрозрачный токен, что у кнопки «Расписание», `:117`) — там записи переносятся («Перенести») и отменяются. Число будущих записей студии показать в шапке заранее: `master-detail.service.ts` — `blockingStudioBookings` тем же `studioMasterBlockingBookingsWhere`.
7. Успех — закрыть окно, снять `?master=` выбора (`router.replace` на список) и `router.refresh()`.
8. Уведомление исключённому мастеру (если владелец решит, см. ниже): функция `notifyStudioMemberRemoved` в `studio-notifications.ts`, текст «Вас исключили из команды «{name}». Ваша страница и личные записи остались.», `pushUrl: /cabinet/master`; вызов — в `members/remove` после коммита, best-effort, как соседние. Тип — новый `STUDIO_MEMBER_REMOVED` в `prisma/schema/enums.prisma`: миграция только `npm run migrate:new -- --name studio_member_removed_notification`, прочитать SQL, затем `npx prisma migrate dev`; добавить в списки `src/lib/notifications/groups.ts:93-101` и `client-cabinet/notification-groups.ts:32` рядом с `STUDIO_MEMBER_LEFT`, проверить канал (`classifyNotificationChannel`) — уведомление должно быть видно мастеру в `/notifications`, как приглашение. Вариант без миграции — тот же `STUDIO_MEMBER_LEFT` с `payloadJson.reason = "REMOVED"`, но тогда в кабинете студии (`chip-classifier.ts:64`) тип начнёт означать два события.

### Мёртвые пути (по прецеденту SCHEDULE-LEGACY-API-REMOVAL)
9. Удалить `POST /api/studios/[id]/leave` (с `id-semantics.test.ts`) и `DELETE` из `src/app/api/studios/[id]/masters/route.ts` (+ `detachMasterFromStudio`, если больше не зовётся), строки в `scripts/openapi-route-allowlist.txt`. `leave-guard.test.ts` выводит набор отвязок из дерева — поправить ожидаемое число путей (4 → 2) и шапку `leave-guard.ts:22-25`.

### Тесты
10. `members-remove-route.test.ts`: чужая студия → 403; своя → вызов с `studio.providerId` этой студии; `isCurrentUser` → 409. `actionable-refusal-passthrough.test.ts` — добавить обе новые поверхности в реестр действенных отказов (конверт 409 `MASTER_HAS_STUDIO_BOOKINGS` строится `findStudioLeaveBlock` + `jsonFail`). Проба по GUARD-INTEGRITY: в новом окне заменить `serverMessageOr` на свою строку → сторож красный.

## Решения владельца
- Сообщать ли мастеру об исключении (шаг 8). Рекомендую да: иначе мастер узнаёт о потере студийного профиля, только открыв кабинет. Цена — одна аддитивная миграция enum.
- Разрешать ли владельцу исключить самого себя-мастера из своей студии. Рекомендую нет (шаг 4) — для этого есть «Выйти из студии» в его кабинете мастера.

## Готово, когда
- Мастер студии видит в `/cabinet/master/account/account` карточку студии и выходит из неё; при будущих записях студии — видит серверный текст с числом и ссылку на записи.
- Админ студии в «Мастерах» удаляет ACTIVE/DISABLED мастера; при будущих записях — серверный текст и ссылка на календарь мастера; после удаления мастер пропадает из списка, его личная страница и личные записи живы, студийные услуги (по галочке) — в его прайсе.
- `members/remove` работает для выбранной в кабинете студии, а не «первой».

## Проверка
- `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake`, `npm run check:openapi-routes` (удалённые роуты), `npx vitest run src/lib/studio src/app/api/cabinet src/lib/http`; при шаге 8 — `npx prisma validate && npx prisma generate`, `npm run check:schema-drift`.
- Живая проверка: Марина (`+7 999 300 00 00`) — `/cabinet/master/account/account` → «Выйти из студии» при записях студии (409 с числом), затем после переноса записей студией — выход; Виктория (`+7 999 200 00 00`) — «Мастера» → мастер → «Удалить из студии» (409 → ссылка в календарь → перенос → удаление); уведомление владельцу «вышел», мастеру «исключили» (шаг 8). Телефон 390×844 и ПК, обе темы.

## Документы
- BACKLOG: удалить `STUDIO-LEAVE-UI`. BACKLOG-DONE: строка.
- Контекст (структурный триггер — роуты, и при шаге 8 — enum): §5 «Уход мастера из студии…» — убрать «⚠️ Интерфейса ухода/исключения сейчас нет», назвать две поверхности; §6 и счётчик API-роутов в шапке — минус удалённый файл `/api/studios/[id]/leave` (у `…/masters` остаётся `GET`, файл не пропадает; шаг 9); при шаге 8 — счётчик миграций и новый тип; `MASTERRYADOM_AI_CONTEXT.md` правится в том же изменении (rule 15).
- `.qa/TESTIDS.md`: `master-leave-studio`, `studio-master-remove` (если добавите `data-testid` на кнопки).

## Риски
- `transferMasterOutOfStudio` идёт Serializable-транзакцией (`transfer-master.ts:44`, `:271`); `toAppError` узнаёт `P2002`, но не `P2034` (`src/lib/api/errors.ts:225-242`) — гонка с созданием записи даст 500. В обоих роутах ловить `P2034` и отвечать 409 «Обновите страницу и попробуйте ещё раз.».
- Перенос услуг копирует цены/длительности; повторный выход-вход не дублирует услуги (поиск по названию, `transfer-master.ts:140-153`) — сохранить поведение.
- Удаление двух мёртвых роутов — убедиться грепом по `.qa/` и `scripts/`, что их никто не зовёт.
