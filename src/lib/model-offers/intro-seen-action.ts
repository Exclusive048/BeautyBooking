"use server";

import { cookies } from "next/headers";
import { MODELS_INTRO_SEEN_COOKIE } from "@/lib/model-offers/user-state";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Marks the visitor as having seen the educational intro on /models.
 * Idempotent — calling it multiple times just refreshes the same cookie.
 *
 * Not httpOnly because it's not sensitive (a binary "seen" flag), and the
 * client never reads it directly anyway — the page itself is server-rendered
 * and re-reads the cookie on the next visit.
 */
export async function markModelsIntroSeen(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: MODELS_INTRO_SEEN_COOKIE,
    value: "1",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    path: "/",
    httpOnly: false,
  });
}
