import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const providerId = url.searchParams.get("providerId");

  if (!providerId) {
    return NextResponse.json({ ok: false, error: "providerId_required" }, { status: 400 });
  }

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, ownerUserId: true },
  });

  if (!provider) {
    return NextResponse.json({ ok: false, error: "provider_not_found" }, { status: 404 });
  }

  if (!provider.ownerUserId || provider.ownerUserId !== user.id) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const bookings = await prisma.booking.findMany({
    where: { providerId },
    orderBy: { createdAt: "desc" },
    include: { service: true },
    take: 200,
  });

  return NextResponse.json({ ok: true, bookings });
}

export async function POST(req: Request) {
  // ✅ Строго: только авторизованные клиенты
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  // ✅ Строго: у юзера должна быть роль CLIENT (она у тебя всегда добавляется при логине, но оставим проверку)
  if (!user.roles.includes("CLIENT")) {
    return NextResponse.json(
      { ok: false, error: "CLIENT_ROLE_REQUIRED" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);

  const providerId = body?.providerId as string | undefined;
  const serviceId = body?.serviceId as string | undefined;

  const slotLabel = body?.slotLabel as string | undefined;
  const clientName = body?.clientName as string | undefined;
  const clientPhone = body?.clientPhone as string | undefined;
  const comment = (body?.comment as string | undefined) ?? null;

  if (!providerId || !serviceId || !slotLabel || !clientName || !clientPhone) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 }
    );
  }

  // Проверяем, что service принадлежит provider
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, providerId: true },
  });

  if (!service || service.providerId !== providerId) {
    return NextResponse.json(
      { ok: false, error: "service_not_belongs_to_provider" },
      { status: 400 }
    );
  }

  const booking = await prisma.booking.create({
    data: {
      providerId,
      serviceId,
      slotLabel,
      clientName,
      clientPhone,
      comment,
      clientUserId: user.id, // ✅ всегда
    },
  });

  return NextResponse.json({ ok: true, booking }, { status: 201 });
}
