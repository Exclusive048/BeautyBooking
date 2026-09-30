/**
 * DELETION-02 (PROVIDER-DANGLING-ROWS) — что происходит с каждой связью
 * `Provider` при удалении кабинета, объявлено один раз и охраняется тестом.
 *
 * ## Почему это отдельная карта, а не строка в `user-data-disposition.ts`
 *
 * Удаление кабинета **не удаляет строку `Provider`** — она анонимизируется и
 * остаётся, потому что на неё завязана история броней. Из этого следует
 * неочевидное: **ни один `onDelete: Cascade` не срабатывает.** Почти все связи
 * `Provider` объявлены каскадными, и это создаёт ложное ощущение, что о них
 * позаботятся автоматически. Не позаботятся — ровно тот же класс, который
 * RKN-FIX-03-A закрыл для `UserProfile` (инв. #35).
 *
 * Практическое подтверждение из того же аудита: `delete-master` чистил
 * расписание, услуги, CRM и портфолио, но оставлял `hotSlotSubscriptions` и
 * `favoritedBy` указывать на мёртвого провайдера. Вреда сегодня нет
 * (провайдер снят с публикации, hot-slots удалены ⇒ рассылок не будет), но это
 * decay: следующая фича, которая пройдётся по подпискам, разбудит их.
 *
 * ## Контракт
 *
 * `provider-data-disposition.test.ts` обходит Prisma DMMF по всем связям
 * `Provider` и падает, если какая-то не классифицирована здесь. Новая связь не
 * пройдёт CI, пока человек не решит, что с ней делать при удалении кабинета.
 */

import type { DispositionKind, RelationDisposition } from "@/lib/deletion/user-data-disposition";

export type { DispositionKind, RelationDisposition };

/**
 * Keyed by the relation FIELD name on `Provider` (Prisma DMMF field names).
 *
 * ⚠️ Напоминание при чтении: `kind: "DELETED"` здесь означает «удаляется ЯВНО
 * в delete-master/delete-studio», а не «удалится каскадом». Каскад не сработает
 * никогда — строка `Provider` переживает удаление.
 */
export const PROVIDER_RELATION_DISPOSITION: Record<string, RelationDisposition> = {
  // ── Владелец и структура ──────────────────────────────────────────────────
  owner: {
    kind: "ANONYMIZED",
    reason:
      "delete-master/delete-studio: `ownerUserId` обнуляется (onDelete: SetNull), сам " +
      "Provider остаётся якорем исторических броней",
  },
  city: {
    kind: "RETAINED",
    reason: "Справочник городов; `onDelete: Restrict` — город не удаляется из-за провайдера",
  },
  studio: {
    kind: "ANONYMIZED",
    reason: "Связь мастера со студией рвётся (SetNull) при удалении студии — мастер выживает",
  },
  masters: {
    kind: "ANONYMIZED",
    reason: "delete-studio: у мастеров студии обнуляется `studioId`, кабинеты мастеров не трогаются",
  },
  masterTimeBlocks: {
    kind: "DELETED",
    reason:
      "LOGIC-19: delete-master удаляет блоки времени мастера ЯВНО. FK на Provider " +
      "добавлен той же находкой (до неё `masterId` был голой строкой, невидимой и для " +
      "БД, и для этого guard'а), но каскад не сработает — строка Provider переживает " +
      "удаление кабинета. Блоки студийного скоупа уходят каскадом от Studio",
  },
  studioProfile: { kind: "DELETED", reason: "delete-studio: строка Studio удаляется явно" },
  masterProfile: { kind: "DELETED", reason: "delete-master: строка MasterProfile удаляется явно" },

  // ── Каталог и расписание: явная чистка в delete-master/delete-studio ──────
  services: { kind: "DELETED", reason: "delete-master/delete-studio: услуги кабинета" },
  masterServices: { kind: "DELETED", reason: "delete-master: связи мастер↔услуга" },
  servicePackages: { kind: "DELETED", reason: "delete-master/delete-studio: пакеты услуг" },
  scheduleOverrides: { kind: "DELETED", reason: "delete-master/delete-studio: исключения расписания" },
  scheduleBreaks: { kind: "DELETED", reason: "delete-master/delete-studio: перерывы" },
  scheduleTemplates: { kind: "DELETED", reason: "delete-master/delete-studio: шаблоны расписания" },
  weeklyScheduleConfig: { kind: "DELETED", reason: "delete-master/delete-studio: недельная конфигурация расписания" },
  schedulePatterns: { kind: "DELETED", reason: "delete-master/delete-studio: графики (SCHEDULE-PATTERNS-01)" },
  scheduleChangeRequests: { kind: "DELETED", reason: "delete-master/delete-studio: заявки на изменение расписания" },
  portfolioItems: {
    kind: "DELETED",
    reason:
      "delete-master: строки портфолио. DELETION-02: связанные MediaAsset (AVATAR/PORTFOLIO) " +
      "теперь ещё и вычищаются из хранилища задачей `media.purge`. STUDIO-PORTFOLIO-FEED: " +
      "delete-studio удаляет строки работ студии (к её фото) так же явно",
  },
  performedPortfolioItems: {
    kind: "ANONYMIZED",
    reason:
      "STUDIO-PORTFOLIO-FEED: подпись исполнителя на фото студии. delete-master обнуляет " +
      "`performerId` явно (SetNull не сработает — Provider выживает), фото остаётся у студии",
  },
  hotSlots: { kind: "DELETED", reason: "delete-master/delete-studio: горячие слоты кабинета" },
  modelOffers: { kind: "DELETED", reason: "delete-master/delete-studio: офферы моделям" },
  publicUsernameAliases: { kind: "DELETED", reason: "delete-master/delete-studio: освобождение публичных хэндлов" },

  // ── Клиентские «указатели» на провайдера — источник dangling-строк ────────
  hotSlotSubscriptions: {
    kind: "DELETED",
    reason:
      "DELETION-02: чужие подписки на горячие слоты ЭТОГО провайдера. Раньше оставались " +
      "висеть — каскад не срабатывает, потому что строка Provider переживает удаление. " +
      "Вреда не было только потому, что hotSlots удаляются и рассылать нечего",
  },
  favoritedBy: {
    kind: "DELETED",
    reason:
      "DELETION-02: каталожные «сердечки» чужих пользователей на этого провайдера. " +
      "Тот же класс: `onDelete: Cascade` объявлен, но не срабатывает",
  },
  discountRule: {
    kind: "DELETED",
    reason:
      "DELETION-02 — ТРЕТИЙ dangling-класс, которого не было в исходном списке: его нашёл " +
      "сам DMMF-guard при первом прогоне. Правило динамических скидок hot-slots " +
      "(`DiscountRule`, 1:1 к провайдеру) не удалялось ни в delete-master, ни в " +
      "delete-studio и оставалось висеть на мёртвом кабинете. Ровно та причина, по которой " +
      "карта нужна машинная, а не «списком из аудита»",
  },

  // ── CRM: удаляется вместе с кабинетом ────────────────────────────────────
  clientCards: {
    kind: "DELETED",
    reason:
      "delete-master/delete-studio: CRM-карточки кабинета (инв. #25 — данные обработки " +
      "мастером). У студии удалялись только с DELETION-03 — до этого карточки переживали её",
  },
  clientNotes: { kind: "DELETED", reason: "delete-master: заметки мастера о клиентах" },

  // ── История: остаётся, ради неё Provider и не удаляется ──────────────────
  bookings: {
    kind: "RETAINED",
    reason:
      "История броней — причина, по которой строка Provider вообще переживает удаление " +
      "кабинета. Удаление блокируется, пока есть АКТИВНЫЕ брони (409 ACTIVE_BOOKINGS)",
  },
  masterBookings: { kind: "RETAINED", reason: "Те же брони со стороны мастера-исполнителя" },
  bookingPackages: { kind: "RETAINED", reason: "Группировка исторических броней" },
  reviewsAbout: {
    kind: "RETAINED",
    reason:
      "Публичные отзывы О провайдере — UGC других людей. Отзывы, НАПИСАННЫЕ владельцем как " +
      "клиентом, кабинету не принадлежат и при его удалении не трогаются (DELETION-03)",
  },
  createdGlobalCategories: {
    kind: "RETAINED",
    reason: "Таксономия платформы: не ПДн, принадлежит каталогу, а не создателю",
  },
};

/** Связи `Provider`, не описанные в карте (вход для DMMF-guard'а). */
export function findUnclassifiedProviderRelations(relationFields: string[]): string[] {
  return relationFields.filter((name) => !PROVIDER_RELATION_DISPOSITION[name]);
}

/** Ключи карты, которых больше нет в схеме (переименовали/удалили связь). */
export function findStaleProviderDispositionKeys(relationFields: string[]): string[] {
  const known = new Set(relationFields);
  return Object.keys(PROVIDER_RELATION_DISPOSITION).filter((key) => !known.has(key));
}

/**
 * Связи, которые обязана вычистить процедура удаления кабинета.
 *
 * DELETION-02 (бонус-скоуп «disposition-to-deleteMany linkage»): карта не просто
 * документирует — она **перечисляет работу**. Тест сверяет этот список с тем,
 * что реально делает `delete-master`, поэтому «классифицировал, но забыл
 * позвать deleteMany» перестаёт быть возможным молча.
 */
export function providerRelationsToDelete(): string[] {
  return Object.entries(PROVIDER_RELATION_DISPOSITION)
    .filter(([, d]) => d.kind === "DELETED")
    .map(([name]) => name)
    .sort();
}
