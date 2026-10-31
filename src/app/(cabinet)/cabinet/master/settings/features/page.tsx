import { redirect } from "next/navigation";
import { FeaturesPageClient } from "@/features/billing/components/features-page-client";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import * as UI_TEXT from "@/lib/ui/text";

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
    <section className="space-y-4 px-4 pb-6 pt-3 md:px-6 md:pt-4 lg:px-8">
      <header>
        <h2 className="text-xl font-semibold text-text-main">
          {UI_TEXT.billing.featuresPage.title}
        </h2>
      </header>
      <FeaturesPageClient scope="MASTER" billingHref="/cabinet/master/billing" />
    </section>
  );
}
