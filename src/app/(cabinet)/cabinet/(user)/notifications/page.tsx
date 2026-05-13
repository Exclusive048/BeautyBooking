import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { ClientNotificationsPage } from "@/features/client-cabinet/notifications/client-notifications-page";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login?next=/cabinet/notifications");

  return <ClientNotificationsPage />;
}
