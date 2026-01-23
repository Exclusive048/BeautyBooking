import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

function providerTypeFromAccountType(accountType: string) {
  if (accountType === "MASTER") return "MASTER";
  if (accountType === "STUDIO" || accountType === "STUDIO_ADMIN") return "STUDIO";
  return null;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const myProvider = await prisma.provider.findFirst({
    where: { ownerUserId: user.id },
    include: { services: true },
  });

  return NextResponse.json({ ok: true, provider: myProvider });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const pType = providerTypeFromAccountType(user.accountType);
  if (!pType) {
    return NextResponse.json(
      { ok: false, error: "FORBIDDEN_ACCOUNT_TYPE" },
      { status: 403 }
    );
  }

  // Если уже есть — просто вернём
  const existing = await prisma.provider.findFirst({
    where: { ownerUserId: user.id },
    include: { services: true },
  });

  if (existing) {
    return NextResponse.json({ ok: true, provider: existing });
  }

  // MVP: создаём с плейсхолдерами — потом добавим редактирование профиля
  const created = await prisma.provider.create({
    data: {
      ownerUserId: user.id,
      type: pType as any,
      name: pType === "MASTER" ? "Новый мастер" : "Новая студия",
      tagline: "Добавьте описание в настройках",
      rating: 0,
      reviews: 0,
      priceFrom: 0,
      address: "Адрес не указан",
      district: "Район не указан",
      categories: [],
      availableToday: false,
    },
    include: { services: true },
  });

  return NextResponse.json({ ok: true, provider: created }, { status: 201 });
}
