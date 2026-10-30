import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * PUBLIC-BOOKING-READ-TOKEN (SEC-11b, 2026-10-30) — карточка записи для экрана
 * успеха виджета: тот же безопасный набор полей, что человек видел при
 * отправке, телефон замаскирован.
 *
 * Раньше её отдавал `GET /api/public/bookings/[id]` любому, кто знал id брони:
 * id считался «неявным токеном». Это не токен — CUID ходит в URL (`?bookingId=`),
 * в реферере и логах, а отдавались имя клиента, комментарий, время и адрес.
 * Теперь у чтения два права и две двери, а карточку собирает одно место:
 *   - сессия стороны брони — `GET /api/public/bookings/[id]` (`resolveBookingSide`);
 *   - подписанный токен гостя — `GET /api/public/bookings/manage/[token]`
 *     (токен в ПУТИ, как у остальных действий по ссылке «Управлять записью»).
 */

export type PublicBookingDto = {
  id: string;
  status: string;
  slotLabel: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  clientName: string | null;
  clientPhoneMasked: string | null;
  comment: string | null;
  service: { id: string; name: string; price: number } | null;
  provider: {
    id: string;
    name: string;
    publicUsername: string | null;
    address: string;
    timezone: string;
  };
};

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const suffix = digits.slice(-4);
  return `••• ${suffix}`;
}

/** Карточка записи или `null`, если её нет. Право на чтение проверяет вызывающий. */
export async function loadPublicBookingDto(bookingId: string): Promise<PublicBookingDto | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      slotLabel: true,
      startAtUtc: true,
      endAtUtc: true,
      clientName: true,
      clientPhone: true,
      comment: true,
      service: { select: { id: true, name: true, title: true, price: true } },
      provider: {
        select: {
          id: true,
          name: true,
          publicUsername: true,
          address: true,
          timezone: true,
        },
      },
    },
  });
  if (!booking) return null;

  return {
    id: booking.id,
    status: booking.status,
    slotLabel: booking.slotLabel,
    startAtUtc: booking.startAtUtc?.toISOString() ?? null,
    endAtUtc: booking.endAtUtc?.toISOString() ?? null,
    clientName: booking.clientName ?? null,
    clientPhoneMasked: maskPhone(booking.clientPhone ?? null),
    comment: booking.comment ?? null,
    service: booking.service
      ? {
          id: booking.service.id,
          name: booking.service.title?.trim() || booking.service.name,
          price: booking.service.price,
        }
      : null,
    provider: {
      id: booking.provider.id,
      name: booking.provider.name,
      publicUsername: booking.provider.publicUsername,
      address: booking.provider.address,
      timezone: booking.provider.timezone,
    },
  };
}
