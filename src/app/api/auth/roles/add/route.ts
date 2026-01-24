import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { roleQuerySchema } from "@/lib/auth/schemas";
import { addRoleToUser, isAllowedRoleAddition, roleRedirect } from "@/lib/auth/roles";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const roleParam = url.searchParams.get("role");
  const parsed = roleQuerySchema.safeParse({ role: roleParam });
  const role = parsed.success ? parsed.data.role : null;

  if (!role || !isAllowedRoleAddition(role)) {
    return NextResponse.redirect(new URL("/roles", req.url));
  }

  await addRoleToUser(user.id, user.roles, role);
  return NextResponse.redirect(new URL(roleRedirect(role), req.url));
}
