import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "./jwt";

export async function getSessionUser() {
  const cookieStore = await cookies();
  const name = process.env.AUTH_COOKIE_NAME ?? "bh_session";
  const token = cookieStore.get(name)?.value;

  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.userProfile.findUnique({
    where: { id: payload.sub },
  });

  return user;
}
