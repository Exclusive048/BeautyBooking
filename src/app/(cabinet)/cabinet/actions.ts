"use server";

import { cookies } from "next/headers";

export async function setLastRole(role: "client" | "provider") {
  const jar = await cookies();
  jar.set("bh_last_role", role, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}
