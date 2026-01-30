import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { markAllNotificationsRead } from "@/lib/notifications/service";

export async function POST() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  await markAllNotificationsRead(auth.user.id);
  return ok({ read: true });
}
