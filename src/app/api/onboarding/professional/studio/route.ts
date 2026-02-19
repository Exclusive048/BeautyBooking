import { createStudioProfile } from "@/lib/profiles/professional";
import { getSessionUser } from "@/lib/auth/session";
import { nextRedirect } from "@/lib/http/origin";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return nextRedirect(req, "/login");

  await createStudioProfile({ userId: user.id, roles: user.roles });
  return nextRedirect(req, "/cabinet/studio");
}
