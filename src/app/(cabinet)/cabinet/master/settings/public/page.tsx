import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PublicSettingsClient } from "@/features/billing/components/public-settings-client";
import { ClientViewLink } from "@/features/cabinet/components/client-view-link";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import * as UI_TEXT from "@/lib/ui/text";
import { personalMasterProviderWhere } from "@/lib/master/access";

export const runtime = "nodejs";

export default async function MasterSettingsPublicPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = await prisma.provider.findFirst({
    where: personalMasterProviderWhere(user.id),
    select: {
      name: true,
      tagline: true,
      address: true,
      description: true,
      avatarUrl: true,
      publicUsername: true,
    },
  });
  if (!provider) redirect("/403");

  // HELP-GUIDE-01: на страницу ведёт пункт «Моя страница» меню мастера —
  // шапка и поля те же, что у остальных страниц кабинета (раньше без них
  // текст на телефоне прижимался к краю экрана).
  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: UI_TEXT.cabinetMaster.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: UI_TEXT.cabinetMaster.nav.items.myPage },
        ]}
        title={UI_TEXT.billing.publicPage.title}
        actions={<ClientViewLink publicUsername={provider.publicUsername} />}
      />
      <div className="px-4 pb-6 pt-3 md:px-6 md:pt-4 lg:px-8">
        <PublicSettingsClient
          endpoint="/api/cabinet/master/public-username"
          name={provider.name}
          tagline={provider.tagline ?? ""}
          address={provider.address ?? ""}
          bio={provider.description ?? ""}
          avatarUrl={provider.avatarUrl ?? null}
          initialUsername={provider.publicUsername}
        />
      </div>
    </>
  );
}
