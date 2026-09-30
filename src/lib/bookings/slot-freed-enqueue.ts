import { prisma } from "@/lib/prisma";
import { enqueue } from "@/lib/queue/queue";
import { createSlotFreedJob } from "@/lib/queue/types";
import { logError } from "@/lib/logging/logger";
import { assertWithinMasterWorkHours, resolveSalonLocalParts } from "@/lib/bookings/policy-enforcement";
import { resolveMasterWorkWindow } from "@/lib/schedule/master-work-window";
import type { BookingWithRelations } from "@/lib/notifications/booking-notifications";

const CANCELLABLE_STATUSES = new Set(["CONFIRMED", "PENDING"]);

const NOTIFY_TARGET_SELECT = {
  id: true,
  name: true,
  publicUsername: true,
  timezone: true,
  type: true,
} as const;

export async function enqueueSlotFreedJob(
  booking: BookingWithRelations,
  cancelledByUserId: string | null
): Promise<void> {
  try {
    if (!CANCELLABLE_STATUSES.has(booking.status) && booking.status !== "REJECTED") {
      return;
    }

    if (!booking.startAtUtc || !booking.endAtUtc) return;

    const performerId = booking.masterProviderId ?? booking.providerId;

    const performer = await prisma.provider.findUnique({
      where: { id: performerId },
      select: {
        ...NOTIFY_TARGET_SELECT,
        masterProfile: { select: { id: true } },
        owner: { select: { masterProfile: { select: { provider: { select: NOTIFY_TARGET_SELECT } } } } },
      },
    });
    if (!performer) return;

    // STUDIO-MASTER-PROFILES (этап 4): подписки на горящие окошки — у ЛИЧНОЙ
    // страницы мастера. Отменили запись профиля в студии — освободилось время
    // человека, и сообщить об этом можно только подписчикам его личной
    // страницы (у профиля в студии ни страницы, ни подписчиков). Но окошко там
    // есть, только если в это время он работает лично: расписания у профилей
    // раздельные, и без проверки подписчик получил бы ссылку на время, на
    // которое записаться нельзя.
    const target = performer.masterProfile ? performer : performer.owner?.masterProfile?.provider ?? null;
    if (!target || target.type !== "MASTER") return;

    if (target.id !== performer.id) {
      const local = resolveSalonLocalParts(booking.startAtUtc, target.timezone);
      const window = await resolveMasterWorkWindow(target.id, local.dateKey);
      const durationMin = Math.round((booking.endAtUtc.getTime() - booking.startAtUtc.getTime()) / 60_000);
      try {
        assertWithinMasterWorkHours({
          bookingStartMinutes: local.minutesFromMidnight,
          bookingEndMinutes: local.minutesFromMidnight + durationMin,
          window,
        });
      } catch {
        return;
      }
    }

    const serviceName = booking.service
      ? (booking.service.title?.trim() || booking.service.name)
      : null;

    await enqueue(
      createSlotFreedJob({
        providerId: target.id,
        providerName: target.name,
        providerPublicUsername: target.publicUsername,
        timezone: target.timezone,
        slotStartAtUtc: booking.startAtUtc.toISOString(),
        slotEndAtUtc: booking.endAtUtc.toISOString(),
        // Услуга студийной записи на личной странице не продаётся — в
        // сообщении подписчику её не называем.
        serviceName: target.id === performer.id ? serviceName : null,
        cancelledByUserId,
      })
    );
  } catch (error) {
    logError("Failed to enqueue slot.freed job", {
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
