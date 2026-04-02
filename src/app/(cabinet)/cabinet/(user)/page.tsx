import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { getMeProfile } from "@/lib/users/profile";
import { ClientDashboard } from "@/features/cabinet/components/client-dashboard";

export default async function CabinetHomePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const me = await getMeProfile(userId);
  if (!me) redirect("/login");

  const displayName =
    me.displayName?.trim() ||
    [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
    null;

  return (
    <ClientDashboard
      displayName={displayName}
      avatarUrl={me.externalPhotoUrl ?? null}
    />
  );
}
