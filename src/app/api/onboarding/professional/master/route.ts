import { NextResponse } from "next/server";
import { createMasterProfile } from "@/lib/profiles/professional";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  await createMasterProfile({ userId: user.id, roles: user.roles });

  return NextResponse.redirect(new URL("/cabinet/master", req.url));
}
