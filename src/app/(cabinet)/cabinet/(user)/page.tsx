import { redirect } from "next/navigation";
import { AccountType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";

export default async function CabinetRootRedirect() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const roles = user.roles ?? [];

  // Master cabinet has its own redesigned shell; route owners to it.
  // STUDIO/STUDIO_ADMIN take precedence over MASTER only when MASTER is absent,
  // so masters-with-a-studio land in their primary workspace.
  if (roles.includes(AccountType.MASTER)) {
    redirect("/cabinet/master/dashboard");
  }
  if (
    roles.includes(AccountType.STUDIO) ||
    roles.includes(AccountType.STUDIO_ADMIN)
  ) {
    redirect("/cabinet/studio");
  }

  redirect("/cabinet/bookings");
}
