import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { MasterBookingsPage } from "@/features/master/components/master-bookings-page";

export const runtime = "nodejs";

export default async function MasterBookingsRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <MasterBookingsPage />;
}
