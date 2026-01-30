import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasMasterProfile } from "@/lib/auth/roles";

export default async function MasterCabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const hasProfile = await hasMasterProfile(user.id);
  if (!hasProfile) {
    redirect("/403");
  }

  return <>{children}</>;
}
