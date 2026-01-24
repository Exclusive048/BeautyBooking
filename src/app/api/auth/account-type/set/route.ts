import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { accountTypeQuerySchema } from "@/lib/auth/schemas";
import { accountTypeRedirect, setAccountTypeRoles } from "@/lib/auth/roles";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type");
  const parsed = accountTypeQuerySchema.safeParse({ type: typeParam });
  const type = parsed.success ? parsed.data.type : null;

  if (!type) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  await setAccountTypeRoles(user.id, user.roles, type);
  return NextResponse.redirect(new URL(accountTypeRedirect(type), req.url));
}
