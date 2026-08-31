import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { generateIcs } from "@/lib/bookings/ics-export";
import {
  ICS_FAILURE_PARAM,
  icsFailureReturnPath,
  type IcsExportFailure,
} from "@/lib/bookings/ics-export-outcome";
import { nextRedirect } from "@/lib/http/origin";
import { logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Calendar export for a single booking. Authenticated client-only — the
 * viewer must be the booking's owner. We accept FINISHED/CANCELLED too so
 * a user can pin a historical visit, but production calendars typically
 * hide past events anyway.
 *
 * Returns text/calendar; download is triggered by Content-Disposition. We
 * don't sign the file — the URL already requires session cookie, so
 * bookmark / share is not a leak vector.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  /**
   * FIX-B18: отказ отвечает НАВИГАЦИЕЙ, а не конвертом.
   *
   * FIX-B14 починил здесь тексты (машинные коды уехали из поля сообщения), но
   * форму оставил: сюда ведёт `<a href>` из «Мои записи», и `{ok:false,…}` в
   * окне браузера — тупик независимо от того, насколько хорош текст внутри.
   * Возврат — к записи, а не на `/login` голый: пользователь шёл к своей
   * брони (см. `ics-export-outcome.ts`).
   */
  const p = params instanceof Promise ? await params : params;
  const backToBooking = (failure: IcsExportFailure) =>
    nextRedirect(req, `${icsFailureReturnPath(p.id)}&${ICS_FAILURE_PARAM}=${failure}`);

  try {
    const user = await getSessionUser();
    if (!user) {
      // Единственный исход, ведущий не к списку: сначала вход, но с `next` на
      // ту же строку — иначе после логина человек окажется не там, куда шёл.
      return nextRedirect(
        req,
        `/login?next=${encodeURIComponent(icsFailureReturnPath(p.id))}`,
      );
    }

    const booking = await prisma.booking.findUnique({
      where: { id: p.id },
      select: {
        id: true,
        clientUserId: true,
        startAtUtc: true,
        endAtUtc: true,
        provider: { select: { name: true, address: true } },
        masterProvider: { select: { name: true, address: true } },
        serviceItems: { select: { titleSnapshot: true }, take: 1 },
        service: { select: { name: true } },
      },
    });

    // ⚠️ Различие «нет записи» / «чужая запись» СОХРАНЕНО умышленно: оно было
    // и до этого фикса, а сведение их в один исход — отдельное решение про
    // раскрытие существования брони, не про форму ответа. Практический риск
    // мал (id — cuid, booking-флоу выведен из rule 12), но менять его молча,
    // под видом правки конверта, было бы ровно тем тихим изменением
    // семантики, против которого написан инв. #43.
    if (!booking) {
      return backToBooking("not_found");
    }
    if (booking.clientUserId !== user.id) {
      return backToBooking("forbidden");
    }
    if (!booking.startAtUtc || !booking.endAtUtc) {
      return backToBooking("no_time");
    }

    const display = booking.masterProvider ?? booking.provider;
    const serviceTitle =
      booking.serviceItems[0]?.titleSnapshot ?? booking.service.name;
    const address = display.address ?? booking.provider.address ?? null;

    const ics = generateIcs({
      uid: `booking-${booking.id}@masterryadom.ru`,
      summary: `${serviceTitle} — ${display.name}`,
      start: booking.startAtUtc.toISOString(),
      end: booking.endAtUtc.toISOString(),
      location: address,
      description: address ? `Адрес: ${address}` : undefined,
    });

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="booking-${booking.id}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logError("GET /api/bookings/[id]/ics failed", {
      stack: error instanceof Error ? error.stack : undefined,
    });
    return backToBooking("failed");
  }
}
