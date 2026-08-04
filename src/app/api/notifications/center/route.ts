import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { getNotificationCenterData } from "@/lib/notifications/center";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

  const data = await getNotificationCenterData({
    userId: user.id,
    phone: user.phone ?? null,
  });

  return jsonOk(data);
}
