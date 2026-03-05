import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { ProfileForm } from "@/features/cabinet/components/profile-form";
import { UI_TEXT } from "@/lib/ui/text";

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

export default async function ProfilePage() {
  const meResponse = await serverApiFetch<{ user: MeDto | null }>("/api/me");
  if (!meResponse.ok || !meResponse.data.user) redirect("/login");

  return (
    <div className="space-y-6">
      <HeaderBlock
        title={UI_TEXT.clientCabinet.common.profile}
        subtitle={UI_TEXT.clientCabinet.profile.subtitle}
      />
      <ProfileForm initialUser={meResponse.data.user} />
    </div>
  );
}
