import { createMasterProfile } from "@/lib/profiles/professional";
import { getSessionUser } from "@/lib/auth/session";
import { nextRedirect } from "@/lib/http/origin";

export async function GET(req: Request) {
  return nextRedirect(req, "/cabinet/roles", 303);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return nextRedirect(req, "/login", 303);

  await createMasterProfile({ userId: user.id, roles: user.roles });

  return nextRedirect(req, "/cabinet/master", 303);
}
