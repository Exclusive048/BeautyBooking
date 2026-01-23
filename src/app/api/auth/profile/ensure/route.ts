import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const user = data.user;

  // Важно: у phone-юзера phone лежит в user.phone
  // (email может быть null)
  const phone = user.phone ?? null;

  const profile = await prisma.userProfile.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      accountType: "CLIENT",
      phone: phone ?? undefined,
    },
    update: {
      phone: phone ?? undefined,
    },
  });

  return NextResponse.json({ ok: true, profile });
}
