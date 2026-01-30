import { NextResponse } from "next/server";
import { createStudioProfile } from "@/lib/profiles/professional";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const result = await createStudioProfile({ userId: user.id, roles: user.roles });
  return NextResponse.redirect(new URL(`/cabinet/studio/${result.studioId}`, req.url));
}
