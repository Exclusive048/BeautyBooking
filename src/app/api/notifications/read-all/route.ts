import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import type { NotificationContext } from "@/lib/notifications/groups";
import { markAllNotificationsRead } from "@/lib/notifications/service";

function parseContext(value: string | null): NotificationContext | undefined {
  if (value === "master" || value === "personal" || value === "all") return value;
  return undefined;
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const context = parseContext(url.searchParams.get("context"));

  await markAllNotificationsRead(auth.user.id, context);
  return ok({ read: true });
}
