import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return NextResponse.json({ ok: true, user: null });
  }

  // Отдаем только безопасные поля
  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      roles: user.roles,
      displayName: user.displayName ?? null,
      phone: user.phone ?? null,
      email: user.email ?? null,
    },
  });
}
