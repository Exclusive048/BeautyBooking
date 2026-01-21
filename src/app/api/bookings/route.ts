import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId") ?? undefined;

    const bookings = await prisma.booking.findMany({
      where: providerId ? { providerId } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        provider: true,
        service: true,
      },
    });

    return NextResponse.json(bookings);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: "Internal error", detail }, { status: 500 });
  }
}

type CreateBookingBody = {
  providerId: string;
  serviceId: string;
  slotLabel: string;
  clientName: string;
  clientPhone: string;
  comment?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<CreateBookingBody>;

    if (!body.providerId || !body.serviceId || !body.slotLabel || !body.clientName || !body.clientPhone) {
      return NextResponse.json({ message: "Missing fields" }, { status: 400 });
    }

    const svc = await prisma.service.findUnique({ where: { id: body.serviceId } });
    if (!svc || svc.providerId !== body.providerId) {
      return NextResponse.json({ message: "Service mismatch" }, { status: 400 });
    }

    const booking = await prisma.booking.create({
      data: {
        providerId: body.providerId,
        serviceId: body.serviceId,
        slotLabel: body.slotLabel,
        clientName: body.clientName.trim(),
        clientPhone: body.clientPhone.trim(),
        comment: body.comment?.trim() ? body.comment.trim() : null,
        status: "PENDING",
      },
    });

    return NextResponse.json(booking, { status: 201 });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: "Internal error", detail }, { status: 500 });
  }
}
