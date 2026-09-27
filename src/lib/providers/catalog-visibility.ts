import { Prisma, ProviderType } from "@prisma/client";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";

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
 * STUDIO-MASTER-PROFILES (этап 2, решение владельца 2026-09-27): профиль мастера
 * продаёт ТОЛЬКО свои услуги — услуги профилей не смешиваются. Прежнее правило
 * CATALOG-CARD-STUDIO-MASTER-SERVICES («мастер студии без своих услуг продаёт
 * студийные», `NO_OWN_SERVICES_WHERE` / `sellsStudioServices`) удалено вместе с
 * ветками карточки, фильтров, ранжирования по цене и поиска по времени: запись
 * на студийную услугу идёт только через студию, иначе она становилась ЛИЧНОЙ
 * записью мастера (`booking-core` теперь такую запись отклоняет).
 */
export function catalogVisibleProviderWhere(): Prisma.ProviderWhereInput {
  return {
    ...CATALOG_PRESENCE_CONDITIONS.hidden,
    ...CATALOG_PRESENCE_CONDITIONS.address,
    ...CATALOG_PRESENCE_CONDITIONS.schedule,
  };
}
