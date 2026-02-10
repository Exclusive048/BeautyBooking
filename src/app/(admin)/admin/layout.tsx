import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasAdminRole } from "@/lib/auth/guards";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user || !hasAdminRole(user)) {
    redirect("/cabinet");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <AdminSidebar />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
