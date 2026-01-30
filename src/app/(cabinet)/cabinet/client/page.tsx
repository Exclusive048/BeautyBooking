import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { CabinetShell } from "@/features/cabinet/components/cabinet-shell";
import { CabinetNavTabs } from "@/features/cabinet/components/cabinet-nav-tabs";
import { ProfileForm } from "@/features/cabinet/components/profile-form";
import { ClientBookingsPanel } from "@/features/cabinet/components/client-bookings-panel";

type MeDto = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  birthDate: string | null;
  address: string | null;
  geoLat: number | null;
  geoLng: number | null;
  hasMasterProfile: boolean;
  hasStudioProfile: boolean;
};

export default async function ClientCabinetPage(props: {
  searchParams?: Promise<{ tab?: string }> | { tab?: string };
}) {
  const sp =
    props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;

  const tab = sp?.tab === "profile" ? "profile" : "bookings";

  if (tab === "profile") {
    const meResponse = await serverApiFetch<{ user: MeDto | null }>("/api/me");

    if (!meResponse.ok) {
      if (meResponse.error.code === "UNAUTHORIZED") redirect("/login");
      redirect("/403");
    }
    if (!meResponse.data.user) redirect("/login");

    return (
      <CabinetShell title="Кабинет клиента" subtitle="Личные данные и настройки.">
        <CabinetNavTabs
          activeId="profile"
          items={[
            { id: "bookings", label: "Записи", href: "/cabinet/client?tab=bookings" },
            { id: "profile", label: "Профиль", href: "/cabinet/client?tab=profile" },
          ]}
        />

        <ProfileForm initialUser={meResponse.data.user} />
      </CabinetShell>
    );
  }

  return (
    <CabinetShell title="Кабинет клиента" subtitle="Ваши записи к мастерам и в студии.">
      <CabinetNavTabs
        activeId="bookings"
        items={[
          { id: "bookings", label: "Записи", href: "/cabinet/client?tab=bookings" },
          { id: "profile", label: "Профиль", href: "/cabinet/client?tab=profile" },
        ]}
      />

      <ClientBookingsPanel />
    </CabinetShell>
  );
}
