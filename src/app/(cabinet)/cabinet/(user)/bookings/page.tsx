import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { ClientBookingsPage } from "@/features/client-cabinet/bookings/client-bookings-page";

export const dynamic = "force-dynamic";

export default async function ClientBookingsRoute() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login?next=/cabinet/bookings");

  return <ClientBookingsPage />;
}
