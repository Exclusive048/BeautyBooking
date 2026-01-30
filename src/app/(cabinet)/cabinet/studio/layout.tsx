import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasAnyStudioAccess } from "@/lib/auth/studio-guards";

export default async function StudioCabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const hasAccess = await hasAnyStudioAccess(user.id);
  if (!hasAccess) {
    redirect("/403");
  }

  return <>{children}</>;
}
