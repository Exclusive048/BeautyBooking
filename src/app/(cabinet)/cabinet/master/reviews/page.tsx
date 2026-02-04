import { redirect } from "next/navigation";
import { MasterReviewsPage } from "@/features/master/components/master-reviews-page";
import { getSessionUser } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";

export default async function MasterReviewsRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const masterId = await getCurrentMasterProviderId(user.id);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Отзывы</h2>
        <p className="text-sm text-text-sec">
          Оценки и комментарии клиентов, отсортированные прямо в кабинете.
        </p>
      </header>
      <MasterReviewsPage masterId={masterId} />
    </section>
  );
}
