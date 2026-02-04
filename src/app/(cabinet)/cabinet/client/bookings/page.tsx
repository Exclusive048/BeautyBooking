import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { CabinetShell } from "@/features/cabinet/components/cabinet-shell";
import { CabinetNavTabs } from "@/features/cabinet/components/cabinet-nav-tabs";
import { ClientBookingsPanel } from "@/features/cabinet/components/client-bookings-panel";
import { UI_TEXT } from "@/lib/ui/text";

type MeDto = {
  id: string;
};

export default async function ClientBookingsPage() {
  const meResponse = await serverApiFetch<{ user: MeDto | null }>("/api/me");
  if (!meResponse.ok || !meResponse.data.user) redirect("/login");
  const t = UI_TEXT.clientCabinet;

  return (
    <CabinetShell title={t.shell.title} subtitle={t.shell.bookingsSubtitle}>
      <CabinetNavTabs
        activeId="bookings"
        items={[
          { id: "bookings", label: t.common.myBookings, href: "/cabinet/client/bookings" },
          { id: "profile", label: t.common.profile, href: "/cabinet/client/profile" },
        ]}
      />
      <ClientBookingsPanel />
    </CabinetShell>
  );
}
