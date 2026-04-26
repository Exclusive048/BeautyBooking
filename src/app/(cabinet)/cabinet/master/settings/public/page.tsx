import { redirect } from "next/navigation";
import { ProviderType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { PublicSettingsClient } from "@/features/billing/components/public-settings-client";
import { UI_TEXT } from "@/lib/ui/text";

export const runtime = "nodejs";

export default async function MasterSettingsPublicPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = await prisma.provider.findFirst({
    where: { ownerUserId: user.id, type: ProviderType.MASTER },
    select: {
      name: true,
      tagline: true,
      address: true,
      description: true,
      avatarUrl: true,
    },
  });
  if (!provider) redirect("/403");

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text-main">
          {UI_TEXT.billing.publicPage.title}
        </h2>
        <p className="text-sm text-text-sec">{UI_TEXT.billing.publicPage.subtitle}</p>
      </header>
      <PublicSettingsClient
        endpoint="/api/cabinet/master/public-username"
        name={provider.name}
        tagline={provider.tagline ?? ""}
        address={provider.address ?? ""}
        bio={provider.description ?? ""}
        avatarUrl={provider.avatarUrl ?? null}
      />
    </section>
  );
}
