import { ok } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import { getVkNotificationStatus } from "@/lib/vk/links";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // VK-COMMUNITY-NOTIFY-01: плюс доступность канала и разрешение сообщений от
  // сообщества — для кнопки «Разрешить сообщения» в общих настройках.
  return ok(await getVkNotificationStatus(auth.user.id));
}
