import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!user.roles.includes("MASTER")) redirect("/403");

  return <>{children}</>;
}
