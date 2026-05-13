import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { ClientReviewsPage } from "@/features/client-cabinet/reviews/client-reviews-page";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login?next=/cabinet/reviews");

  return <ClientReviewsPage />;
}
