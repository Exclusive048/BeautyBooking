import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
import { NotificationsCenterPage } from "@/features/notifications/components/notifications-center-page";
import { getSessionUser } from "@/lib/auth/session";
import { getNotificationCenterData } from "@/lib/notifications/center";

export default async function NotificationsRoutePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const data = await getNotificationCenterData({
    userId: user.id,
    phone: user.phone ?? null,
  });

  return <NotificationsCenterPage initialData={data} />;
}
