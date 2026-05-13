import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { generateIcs } from "@/lib/bookings/ics-export";
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
  _req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const p = params instanceof Promise ? await params : params;

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

    if (!booking) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    if (booking.clientUserId !== user.id) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
    if (!booking.startAtUtc || !booking.endAtUtc) {
      return NextResponse.json({ ok: false, error: "NO_TIME" }, { status: 400 });
    }

    const display = booking.masterProvider ?? booking.provider;
    const serviceTitle =
      booking.serviceItems[0]?.titleSnapshot ?? booking.service.name;
    const address = display.address ?? booking.provider.address ?? null;

    const ics = generateIcs({
      uid: `booking-${booking.id}@masterryadom.online`,
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
    return NextResponse.json({ ok: false, error: "INTERNAL" }, { status: 500 });
  }
}
