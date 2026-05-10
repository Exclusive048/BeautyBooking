import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk, jsonFail } from "@/lib/api/contracts";
import { logError, getRequestId } from "@/lib/logging/logger";

/**
 * Public booking detail endpoint — hydrates the widget's success
 * phase on refresh / share-link reopen (32b).
 *
 * The `bookingId` itself is the implicit access token: anyone who
 * already received the URL after a successful submit can re-render
 * the confirmation card without re-authenticating. We compensate by
 * returning a **safe DTO** — only fields the user already saw on
 * submit, with `clientPhone` masked. No `clientUserId`, no internal
 * status flags, no other clients of the master.
 */

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  const suffix = digits.slice(-4);
  return `••• ${suffix}`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  const p = params instanceof Promise ? await params : params;
  const requestId = getRequestId(req);

  if (!p.id || p.id.length < 8 || p.id.length > 64) {
    return jsonFail(400, "Некорректный идентификатор записи.", "VALIDATION_ERROR");
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: p.id },
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

    if (!booking) {
      return jsonFail(404, "Запись не найдена.", "NOT_FOUND");
    }

    return jsonOk({
      booking: {
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
      },
    });
  } catch (error) {
    logError("GET /api/public/bookings/[id] failed", {
      requestId,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Не удалось загрузить запись." } },
      { status: 500 },
    );
  }
}
