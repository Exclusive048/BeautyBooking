import { redirect } from "next/navigation";
import { FeaturesPageClient } from "@/features/billing/components/features-page-client";
import { getSessionUser } from "@/lib/auth/session";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";
import { UI_TEXT } from "@/lib/ui/text";

export const runtime = "nodejs";

export default async function StudioFeaturesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const hasAccess = await hasStudioAdminAccess(user.id);
  if (!hasAccess) redirect("/403");

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold text-text-main">
          {UI_TEXT.billing.featuresPage.title}
        </h2>
        <p className="text-sm text-text-sec">{UI_TEXT.billing.featuresPage.subtitle}</p>
      </header>
      <FeaturesPageClient scope="STUDIO" billingHref="/cabinet/studio/billing" />
    </section>
  );
}
