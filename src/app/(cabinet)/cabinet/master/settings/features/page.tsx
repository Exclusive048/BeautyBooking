import { redirect } from "next/navigation";
import { FeaturesPageClient } from "@/features/billing/components/features-page-client";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { UI_TEXT } from "@/lib/ui/text";

export const runtime = "nodejs";

export default async function MasterSettingsFeaturesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  try {
    await getCurrentMasterProviderId(user.id);
  } catch {
    redirect("/403");
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text-main">
          {UI_TEXT.billing.featuresPage.title}
        </h2>
        <p className="text-sm text-text-sec">{UI_TEXT.billing.featuresPage.subtitle}</p>
      </header>
      <FeaturesPageClient scope="MASTER" billingHref="/cabinet/master/billing" />
    </section>
  );
}
