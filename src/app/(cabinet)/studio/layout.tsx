import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const ok = user.roles.includes("STUDIO") || user.roles.includes("STUDIO_ADMIN");
  if (!ok) redirect("/403");

  return <>{children}</>;
}
