import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const name = process.env.AUTH_COOKIE_NAME ?? "bh_session";

  cookieStore.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  const url = new URL("/", req.url);
  return NextResponse.redirect(url);
}
