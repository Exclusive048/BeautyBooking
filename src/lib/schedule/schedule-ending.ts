import "server-only";

import { NotificationType } from "@prisma/client";
import { SCHEDULE_ENDING_NOTICE_DAYS } from "@/lib/schedule/calendar-shared";
import { deliverNotification } from "@/lib/notifications/delivery";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey, diffDateKeys } from "@/lib/schedule/dateKey";
import { parseDateKeyToUtcStart } from "@/lib/schedule/editor-shared";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — «расписание скоро закончится».
 *
 * Решение владельца 2026-09-28: расписание действует ровно до даты, которую
 * настроили (автопродление в окне по умолчанию выключено). После неё клиенты
 * не видят окошек — и мастер узнаёт об этом, только когда записи кончатся.
 * Поэтому за `SCHEDULE_ENDING_NOTICE_DAYS` дней до конца мастеру уходит
 * уведомление — одно на дату окончания: продлил график, и новая дата получит
 * своё напоминание в свой срок.
 *
 * Кому: у личного профиля — самому мастеру (`SCHEDULE_ENDING`, в настройки
 * расписания). У профиля мастера в студии график решает студия, поэтому
 * напоминание уходит владельцу студии (`STUDIO_SCHEDULE_ENDING`, в «График
 * команды»; SCHEDULE-STUDIO-PROFILE-CALENDAR) — и только за активного мастера:
 * у мастера на паузе окошек нет и так.
 *
 * Даты — даты салона (`toLocalDateKey` в поясе профиля); выборка кандидатов по
 * датам UTC с запасом в день, окончательное решение — по дате салона.
 */

const SETTINGS_HREF = "/cabinet/master/schedule/settings";
const TEAM_HREF = "/cabinet/studio/schedule/team";

const T = UI_TEXT.cabinetMaster.scheduleSettings.plan;

export async function runScheduleEndingReminders(now = new Date()): Promise<{ candidates: number; sent: number }> {
  const utcToday = now.toISOString().slice(0, 10);
  const minKey = addDaysToDateKey(utcToday, -1);
  const maxKey = addDaysToDateKey(utcToday, SCHEDULE_ENDING_NOTICE_DAYS + 1);

  const candidates = await prisma.provider.findMany({
    where: {
      type: "MASTER",
      OR: [
        // Личный профиль мастера.
        { ownerUserId: { not: null }, masterProfile: { isNot: null } },
        // Профиль мастера в студии (без `MasterProfile`), активный в ней.
        { studioId: { not: null }, masterProfile: { is: null }, ...STUDIO_ACTIVE_MASTER_WHERE },
      ],
      schedulePatterns: {
        some: { endsOn: { gte: minKey, lte: maxKey } },
        // Бессрочный или дальше окна период — расписание не кончается.
        none: { OR: [{ endsOn: null }, { endsOn: { gt: maxKey } }] },
      },
    },
    select: {
      id: true,
      name: true,
      timezone: true,
      ownerUserId: true,
      studioId: true,
      studio: {
        select: { ownerUserId: true, studioProfile: { select: { ownerUserId: true } } },
      },
      // include-ok: периоды графика одного профиля — единицы (новый обрезает старые).
      schedulePatterns: { select: { endsOn: true } },
    },
  });

  let sent = 0;
  for (const provider of candidates) {
    const recipient = resolveRecipient(provider);
    if (!recipient) continue;
    const endsOn = provider.schedulePatterns
      .map((period) => period.endsOn)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1);
    if (!endsOn) continue;

    const todayKey = toLocalDateKey(now, provider.timezone);
    const daysLeft = diffDateKeys(todayKey, endsOn);
    if (daysLeft < 0 || daysLeft > SCHEDULE_ENDING_NOTICE_DAYS) continue;

    // Рабочие дни, отмеченные в календаре после конца графика, — расписание
    // на них продолжается, напоминать не о чем.
    const laterWorkingDays = await prisma.scheduleOverride.count({
      where: { providerId: provider.id, date: { gt: parseDateKeyToUtcStart(endsOn) }, isDayOff: false },
    });
    if (laterWorkingDays > 0) continue;

    const already = await prisma.notification.findFirst({
      where: {
        userId: recipient.userId,
        type: recipient.type,
        AND: [
          { payloadJson: { path: ["providerId"], equals: provider.id } },
          { payloadJson: { path: ["endsOn"], equals: endsOn } },
        ],
      },
      select: { id: true },
    });
    if (already) continue;

    // Дата-ключ — календарная дата без пояса: подпись в UTC полудня.
    const dateLabel = UI_FMT.dateShort(`${endsOn}T12:00:00.000Z`, { timeZone: "UTC" });
    const studio = recipient.type === NotificationType.STUDIO_SCHEDULE_ENDING;
    await deliverNotification({
      userId: recipient.userId,
      type: recipient.type,
      title: studio ? T.studioEndingNotificationTitle : T.endingNotificationTitle,
      body: studio
        ? T.studioEndingNotificationBody(provider.name, dateLabel)
        : T.endingNotificationBody(dateLabel),
      payloadJson: { providerId: provider.id, endsOn, settingsHref: recipient.href },
      pushUrl: recipient.href,
      emailCtaUrl: recipient.href,
    });
    sent += 1;
  }

  return { candidates: candidates.length, sent };
}

/** Кому напоминать: мастеру о личном расписании, владельцу студии — о расписании в студии. */
function resolveRecipient(provider: {
  ownerUserId: string | null;
  studioId: string | null;
  studio: { ownerUserId: string | null; studioProfile: { ownerUserId: string | null } | null } | null;
}): { userId: string; type: NotificationType; href: string } | null {
  if (provider.studioId) {
    const owner = provider.studio?.studioProfile?.ownerUserId ?? provider.studio?.ownerUserId ?? null;
    return owner ? { userId: owner, type: NotificationType.STUDIO_SCHEDULE_ENDING, href: TEAM_HREF } : null;
  }
  return provider.ownerUserId
    ? { userId: provider.ownerUserId, type: NotificationType.SCHEDULE_ENDING, href: SETTINGS_HREF }
    : null;
}
