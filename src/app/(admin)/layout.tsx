import type { Metadata } from "next";
import { AccountType } from "@prisma/client";
import { redirect } from "next/navigation";
import { AdminShell } from "@/features/admin-cabinet/components/admin-shell";
import type {
  AdminPanelRole,
  AdminPanelUser,
} from "@/features/admin-cabinet/types";
import { hasAdminRole } from "@/lib/auth/guards";
import { getSessionUser } from "@/lib/auth/session";
import { UI_TEXT } from "@/lib/ui/text";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function resolveAdminRole(roles: AccountType[]): AdminPanelRole {
  return roles.includes(AccountType.SUPERADMIN) ? "SUPERADMIN" : "ADMIN";
}

function resolveDisplayName(user: {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}): string {
  const display = user.displayName?.trim();
  if (display) return display;
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  const email = user.email?.trim();
  if (email) return email;
  const phone = user.phone?.trim();
  if (phone) return phone;
  return UI_TEXT.adminPanel.role.admin;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasAdminRole(user)) redirect("/403");

  const adminUser: AdminPanelUser = {
    name: resolveDisplayName(user),
    avatarUrl: user.externalPhotoUrl ?? null,
    role: resolveAdminRole(user.roles),
  };

  return <AdminShell user={adminUser}>{children}</AdminShell>;
}
