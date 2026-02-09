import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { serverApiFetch } from "@/lib/api/server-fetch";
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

export default async function ProfilePage() {
  const meResponse = await serverApiFetch<{ user: MeDto | null }>("/api/me");
  if (!meResponse.ok || !meResponse.data.user) redirect("/login");

  return (
    <div className="space-y-6">
      <HeaderBlock title="Профиль" subtitle="Личные данные и контактная информация" />
      <ProfileForm initialUser={meResponse.data.user} />
    </div>
  );
}
