import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { ClientBookingsPanel } from "@/features/cabinet/components/client-bookings-panel";
import { getSessionUser } from "@/lib/auth/session";
import { UI_TEXT } from "@/lib/ui/text";

export default async function ClientBookingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <HeaderBlock title={UI_TEXT.clientCabinet.common.myBookings} subtitle={UI_TEXT.clientCabinet.shell.bookingsSubtitle} />
      <ClientBookingsPanel />
    </div>
  );
}
