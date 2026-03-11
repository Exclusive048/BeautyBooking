import { redirect } from "next/navigation";
import { HeaderBlock } from "@/components/ui/header-block";
import { getSessionUserId } from "@/lib/auth/session";
import { ProfileForm } from "@/features/cabinet/components/profile-form";
import { UI_TEXT } from "@/lib/ui/text";
import { getMeProfile } from "@/lib/users/profile";

export default async function ProfilePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const me = await getMeProfile(userId);
  if (!me) redirect("/login");

  return (
    <div className="space-y-6">
      <HeaderBlock
        title={UI_TEXT.clientCabinet.common.profile}
        subtitle={UI_TEXT.clientCabinet.profile.subtitle}
      />
      <ProfileForm initialUser={me} />
    </div>
  );
}
