import { Prisma, ProviderType } from "@prisma/client";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";
import { STUDIO_ACCEPTS_BOOKINGS_WHERE, studioAcceptsBookings } from "@/lib/studio/accepts-bookings";

/**
 * VISIBILITY-DEFAULT-01 — кого показывать там, где клиент НАХОДИТ провайдера
 * (каталог, поиск, автокомплит, лента, список городов, счётчик на главной).
 *
 * Решение владельца (2026-09-23): видимость кабинета мастера и студии включена
 * по умолчанию, в каталоге профиль появляется, когда у него есть расписание, а
 * выключить видимость человек может сам в настройках. Отсюда два разных факта:
 *
 *  - `Provider.isPublished` — ЖЕЛАНИЕ владельца быть видимым (переключатель в
 *    настройках). Для страницы по прямой ссылке и записи по ней достаточно его;
 *  - этот предикат — «можно НАЙТИ»: желание + город + хотя бы один рабочий день.
 *    У студии рабочих часов нет вовсе — они у мастеров, поэтому студию находят,
 *    когда у неё есть хотя бы один АКТИВНЫЙ мастер с рабочим днём.
 *
 * Город — не новое условие, а сохранённое старое: раньше включить видимость
 * без адреса с распознанным городом было нельзя (ADDRESS_REQUIRED), то есть
 * «опубликован ⇒ есть город» держалось на пути записи. Теперь видимость
 * включена с рождения кабинета, и без этого условия в выдаче «все города»
 * оказался бы провайдер без адреса.
 *
 * Рабочий день — ровно правило движка расписания (`buildRuleFromWeeklyConfig`:
 * день активен и у него есть шаблон часов), иначе каталог показывал бы
 * провайдера, у которого движок не найдёт ни одного окошка.
 *
 * ⚠️ Результат — отдельный объект с собственным `OR`: вызывающий кладёт его в
 * `AND`, а не разворачивает спредом рядом со своим `OR` — ключ перезаписался бы
 * молча.
 */
export const WORKING_WEEK_WHERE = {
  weeklyScheduleConfig: {
    is: { days: { some: { isActive: true, templateId: { not: null } } } },
  },
} satisfies Prisma.ProviderWhereInput;

/**
 * VISIBILITY-CATALOG-STATUS (2026-09-23) — те же три условия ПО ОТДЕЛЬНОСТИ,
 * чтобы кабинет мог сказать, КАКОГО не хватает (`catalog-presence.ts`).
 * Предикат ниже собирается из них же — второй копии правила нет. Ключи
 * условий не пересекаются, поэтому спред даёт ровно прежний объект.
 */
export type CatalogPresenceGap = "hidden" | "address" | "schedule";

export const CATALOG_PRESENCE_CONDITIONS = {
  hidden: { isPublished: true },
  address: { cityId: { not: null } },
  schedule: {
    OR: [
      { type: ProviderType.MASTER, ...WORKING_WEEK_WHERE },
      {
        type: ProviderType.STUDIO,
        masters: { some: { ...STUDIO_ACTIVE_MASTER_WHERE, ...WORKING_WEEK_WHERE } },
      },
    ],
  },
} satisfies Record<CatalogPresenceGap, Prisma.ProviderWhereInput>;

/**
 * CATALOG-CARD-STUDIO-MASTER-SERVICES (2026-09-23) — у провайдера нет ни одной
 * своей продаваемой услуги. Студийные связи (`MasterService`) продают только в
 * этом случае: мастер студии со СВОИМИ услугами продаёт на личной странице их
 * (`getProviderProfile` → `sellsOwnServices`), и всякая поверхность, где его
 * находят по услуге (карточка каталога, фильтры, поиск по времени), обязана
 * показывать то же самое. Живёт рядом с предикатом видимости, потому что у
 * правила несколько потребителей, а копия разошлась бы со страницей.
 */
export const NO_OWN_SERVICES_WHERE = {
  services: { none: { isEnabled: true, isActive: true } },
  // STUDIO-PAUSE-SPLIT-01: мастер на паузе в студии студийных услуг не продаёт
  // (`booking-core` откажет `MASTER_NOT_ACTIVE`), даже если его личная страница
  // открыта.
  studioPaused: false,
  // STUDIO-HIDDEN-MASTER-SERVICES: скрытая студия записей не принимает — её
  // услуги через мастеров не продаются (`booking-core` откажет).
  studio: { is: STUDIO_ACCEPTS_BOOKINGS_WHERE },
} satisfies Prisma.ProviderWhereInput;

/**
 * То же правило в памяти — для витрины, собранной из уже прочитанных строк
 * (карточка каталога, ранжирование по цене, личная страница мастера): мастер
 * продаёт студийные услуги, только если своих нет, он не на паузе в студии и
 * студия принимает записи. Одна функция на три поверхности — иначе карточка,
 * сортировка и страница снова разойдутся.
 */
export function sellsStudioServices(master: {
  ownServiceCount: number;
  studioPaused: boolean;
  studio: { isPublished: boolean } | null | undefined;
}): boolean {
  return master.ownServiceCount === 0 && !master.studioPaused && studioAcceptsBookings(master.studio);
}

export function catalogVisibleProviderWhere(): Prisma.ProviderWhereInput {
  return {
    ...CATALOG_PRESENCE_CONDITIONS.hidden,
    ...CATALOG_PRESENCE_CONDITIONS.address,
    ...CATALOG_PRESENCE_CONDITIONS.schedule,
  };
}
