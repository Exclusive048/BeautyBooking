import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasAdminRole } from "@/lib/auth/guards";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (!hasAdminRole(user)) {
    redirect("/403");
  }

  return <section className="space-y-4">{children}</section>;
}
