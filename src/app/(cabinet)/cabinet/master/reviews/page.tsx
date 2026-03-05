import { redirect } from "next/navigation";
import { MasterReviewsPage } from "@/features/master/components/master-reviews-page";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { UI_TEXT } from "@/lib/ui/text";

export default async function MasterReviewsRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const masterId = await getCurrentMasterProviderId(user.id);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{UI_TEXT.master.reviews.title}</h2>
        <p className="text-sm text-text-sec">{UI_TEXT.master.reviews.subtitle}</p>
      </header>
      <MasterReviewsPage masterId={masterId} />
    </section>
  );
}
