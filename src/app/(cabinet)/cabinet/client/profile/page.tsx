import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { CabinetShell } from "@/features/cabinet/components/cabinet-shell";
import { CabinetNavTabs } from "@/features/cabinet/components/cabinet-nav-tabs";
import { ProfileForm } from "@/features/cabinet/components/profile-form";

type MeDto = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
  externalPhotoUrl: string | null;
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

export default async function ClientProfilePage() {
  const meResponse = await serverApiFetch<{ user: MeDto | null }>("/api/me");
  if (!meResponse.ok || !meResponse.data.user) redirect("/login");

  return (
    <CabinetShell title="Client cabinet" subtitle="Personal profile and settings.">
      <CabinetNavTabs
        activeId="profile"
        items={[
          { id: "bookings", label: "My bookings", href: "/cabinet/client/bookings" },
          { id: "profile", label: "Profile", href: "/cabinet/client/profile" },
        ]}
      />
      <ProfileForm initialUser={meResponse.data.user} />
    </CabinetShell>
  );
}
