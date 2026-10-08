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
const WORKING_WEEK_WHERE = {
  weeklyScheduleConfig: {
    is: { days: { some: { isActive: true, templateId: { not: null } } } },
  },
} satisfies Prisma.ProviderWhereInput;

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — «есть расписание» с графиками по датам:
 * период графика, не кончившийся до сегодня, с хотя бы одним рабочим днём
 * (расписание настраивается «на сколько настроил», решение владельца, —
 * кончившееся расписание окошек не даёт). Профиль без графика (перенос недели
 * ещё не прошёл) проверяется по-старому — по неделе.
 *
 * «Сегодня» — дата UTC: у салонов РФ (UTC+2…+12) дата салона бывает на день
 * впереди, то есть кончившийся вчера график может продержаться в выдаче до
 * полуночи UTC. Это в пользу мастера и дешевле, чем пояс на каждого.
 *
 * Этап 3 — третья ветка: рабочий день, отмеченный в календаре на сегодня или
 * позже («Каждый раз по-разному — отмечу дни сам» — график без рабочих дней,
 * а рабочие дни стоят в календаре). Дата «Особого дня» хранится полночью UTC
 * даты салона, поэтому сравнение с полночью UTC сегодняшней даты точное.
 */
function providerHasScheduleWhere(todayKey: string): Prisma.ProviderWhereInput {
  return {
    OR: [
      {
        scheduleOverrides: {
          some: {
            date: { gte: new Date(`${todayKey}T00:00:00.000Z`) },
            isDayOff: false,
            OR: [
              { kind: "TEMPLATE", templateId: { not: null }, OR: [{ isActive: null }, { isActive: true }] },
              { kind: "TIME_RANGE", startLocal: { not: null } },
            ],
          },
        },
      },
      {
        schedulePatterns: {
          some: {
            OR: [{ endsOn: null }, { endsOn: { gte: todayKey } }],
            days: { some: { templateId: { not: null } } },
          },
        },
      },
      { AND: [{ schedulePatterns: { none: {} } }, WORKING_WEEK_WHERE] },
    ],
  };
}

/**
 * VISIBILITY-CATALOG-STATUS (2026-09-23) — те же три условия ПО ОТДЕЛЬНОСТИ,
 * чтобы кабинет мог сказать, КАКОГО не хватает (`catalog-presence.ts`).
 * Предикат ниже собирается из них же — второй копии правила нет. Ключи
 * условий не пересекаются, поэтому спред даёт ровно прежний объект.
 */
export type CatalogPresenceGap = "hidden" | "address" | "schedule";

export function catalogPresenceConditions(
  now: Date = new Date(),
): Record<CatalogPresenceGap, Prisma.ProviderWhereInput> {
  const hasSchedule = providerHasScheduleWhere(now.toISOString().slice(0, 10));
  return {
    hidden: { isPublished: true },
    address: { cityId: { not: null } },
    schedule: {
      OR: [
        { type: ProviderType.MASTER, AND: [hasSchedule] },
        {
          type: ProviderType.STUDIO,
          masters: { some: { AND: [STUDIO_ACTIVE_MASTER_WHERE, hasSchedule] } },
        },
      ],
    },
  };
}

/**
 * STUDIO-MASTER-PROFILES (этап 2, решение владельца 2026-09-27): профиль мастера
 * продаёт ТОЛЬКО свои услуги — услуги профилей не смешиваются. Прежнее правило
 * CATALOG-CARD-STUDIO-MASTER-SERVICES («мастер студии без своих услуг продаёт
 * студийные», `NO_OWN_SERVICES_WHERE` / `sellsStudioServices`) удалено вместе с
 * ветками карточки, фильтров, ранжирования по цене и поиска по времени: запись
 * на студийную услугу идёт только через студию, иначе она становилась ЛИЧНОЙ
 * записью мастера (`booking-core` теперь такую запись отклоняет).
 */
/**
 * Условие карточки каталога поверх видимости: у профиля есть хотя бы одна СВОЯ
 * включённая услуга (STUDIO-MASTER-PROFILES — мастер студии без своих услуг
 * находится через студию). Кладётся в `AND` рядом с предикатом видимости:
 * каталог и sitemap отбирают одно и то же множество профилей.
 */
export const SELLS_OWN_SERVICES_WHERE = {
  services: { some: { isEnabled: true, isActive: true } },
} satisfies Prisma.ProviderWhereInput;

export function catalogVisibleProviderWhere(now: Date = new Date()): Prisma.ProviderWhereInput {
  const conditions = catalogPresenceConditions(now);
  return {
    ...conditions.hidden,
    ...conditions.address,
    ...conditions.schedule,
  };
}
