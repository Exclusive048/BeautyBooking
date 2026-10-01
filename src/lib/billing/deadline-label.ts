import "server-only";
import { ProviderType, type SubscriptionScope } from "@prisma/client";
import { env } from "@/lib/env";
import { personalMasterProviderWhere } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { UI_FMT } from "@/lib/ui/fmt";
import { formatZoneLabel } from "@/lib/ui/zone-label";

/**
 * LOGIC-25 — дедлайн биллингового opt-in-окна в СЕРВЕРНОМ уведомлении.
 *
 * Дефект: `dateRU` (`lib/format.ts`) не принимает `timeZone` вовсе, то есть
 * форматирует в ambient-tz процесса. В клиентском кабинете это корректно
 * (viewer-tz — осознанный выбор для биллинговых дат), но оба вызова из cron'а
 * браузерного контекста не имеют в принципе: дата зависела от того, с какой
 * `TZ` запущен контейнер. Граница суток — реальный риск, а не теоретический:
 * провайдер в Екатеринбурге читает «до 12 августа», пока cron экспайрит по
 * инстанту, который у него уже 13-е.
 *
 * Источник tz — **salon-tz провайдера** (rule 17): получатель уведомления и
 * есть владелец кабинета, и дата обязана совпасть с его настенными часами.
 * Метка зоны прикрепляется ВСЕГДА — по тому же правилу, что и у
 * `formatBookingWhenLabel`: у серверного сообщения нет зрителя, чью зону можно
 * сравнить, поэтому получатель не должен иметь возможности молча прочитать
 * дату по своим часам.
 */
export function formatBillingDeadlineLabel(date: Date | null, timeZone: string): string {
  if (!date) return "";
  const label = UI_FMT.date(date, "dayMonthYearLong", { timeZone });
  const zone = formatZoneLabel({ iso: date.toISOString(), timeZone });
  return zone ? `${label} ${zone}` : label;
}

/**
 * Рабочая таймзона кабинета, за который платит подписка. `SubscriptionScope`
 * ложится на `ProviderType` один в один, поэтому отдельного маппинга не нужно.
 *
 * Никогда не бросает и не возвращает null: это путь cron-уведомления, и
 * отсутствие кабинета (подписка заведена до создания профиля) не повод не
 * отправить напоминание о деньгах. Запасной вариант — платформенный дефолт,
 * тот же, что стоит `@default` у `Provider.timezone`.
 */
export async function resolveSubscriptionTimezone(
  userId: string,
  scope: SubscriptionScope
): Promise<string> {
  // STUDIO-MASTER-PROFILES (этап 4): подписка мастера — его личного профиля;
  // «самый старый MASTER» мог оказаться профилем в студии (пояс студии).
  const provider = await prisma.provider.findFirst({
    where:
      scope === "STUDIO"
        ? { ownerUserId: userId, type: ProviderType.STUDIO }
        : personalMasterProviderWhere(userId),
    select: { timezone: true },
    orderBy: { createdAt: "asc" },
  });
  return provider?.timezone || env.DEFAULT_TIMEZONE;
}
