import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccountNav } from "@/features/master/components/account/account-nav";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster;

/**
 * Shared shell for `/cabinet/master/account/*` sub-routes (fix-04a).
 *
 * Auth check + page header + nav live here. Each sub-page
 * (`notifications`, `security`, `account`) fetches what it needs and
 * renders inside the `{children}` slot below. Bookmarkable URLs
 * replace the previous `?tab=` query state.
 */
export default async function MasterAccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.account.breadcrumb },
        ]}
        title={T.account.title}
        subtitle={T.account.subtitle}
      />

      <div className="space-y-6 px-4 py-6 md:px-6 lg:px-8">
        <AccountNav />

        <div className="max-w-3xl">{children}</div>
      </div>
    </>
  );
}
