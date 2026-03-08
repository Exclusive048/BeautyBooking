import { BillingPage } from "@/features/billing/components/billing-page";
import { AccountType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { CabinetNavTabs, type CabinetNavItem } from "@/features/cabinet/components/cabinet-nav-tabs";

export const runtime = "nodejs";

export default async function Page() {
  const user = await getSessionUser();

  const navItems: CabinetNavItem[] = [];
  if (user?.roles.includes(AccountType.MASTER)) {
    navItems.push({ id: "master", label: "Кабинет мастера", href: "/cabinet/master/dashboard" });
  }
  if (user?.roles.includes(AccountType.STUDIO) || user?.roles.includes(AccountType.STUDIO_ADMIN)) {
    navItems.push({ id: "studio", label: "Кабинет студии", href: "/cabinet/studio" });
  }
  navItems.push({ id: "billing", label: "Подписка", href: "/cabinet/billing" });

  return (
    <section className="space-y-4">
      {navItems.length > 1 ? <CabinetNavTabs items={navItems} activeId="billing" /> : null}
      <BillingPage />
    </section>
  );
}
