import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { CabinetShell } from "@/features/cabinet/components/cabinet-shell";
import { CabinetNavTabs } from "@/features/cabinet/components/cabinet-nav-tabs";
import { ClientBookingsPanel } from "@/features/cabinet/components/client-bookings-panel";

type MeDto = {
  id: string;
};

export default async function ClientBookingsPage() {
  const meResponse = await serverApiFetch<{ user: MeDto | null }>("/api/me");
  if (!meResponse.ok || !meResponse.data.user) redirect("/login");

  return (
    <CabinetShell title="Client cabinet" subtitle="Your upcoming and past bookings.">
      <CabinetNavTabs
        activeId="bookings"
        items={[
          { id: "bookings", label: "My bookings", href: "/cabinet/client/bookings" },
          { id: "profile", label: "Profile", href: "/cabinet/client/profile" },
        ]}
      />
      <ClientBookingsPanel />
    </CabinetShell>
  );
}
