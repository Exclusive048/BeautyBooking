import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { ClientProfilePage } from "@/features/client-cabinet/profile/client-profile-page";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login?next=/cabinet/profile");

  return <ClientProfilePage userId={userId} />;
}
