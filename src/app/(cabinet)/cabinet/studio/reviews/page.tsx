import { redirect } from "next/navigation";
import { StudioReviewsPage } from "@/features/studio/components/studio-reviews-page";
import { getSessionUser } from "@/lib/auth/session";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { UI_TEXT } from "@/lib/ui/text";

type ReviewFilter = "all" | "new" | "unanswered";

type Props = {
  searchParams?: Promise<{ filter?: string }> | { filter?: string };
};

function normalizeFilter(value: string | undefined): ReviewFilter {
  if (value === "new" || value === "unanswered" || value === "all") {
    return value;
  }
  return "all";
}

export default async function StudioReviewsRoute({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let providerId: string;
  try {
    ({ providerId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams;
  const initialFilter = normalizeFilter(params?.filter);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{UI_TEXT.studioCabinet.dashboard.cards.reviews}</h2>
        <p className="text-sm text-text-sec">{UI_TEXT.studioCabinet.reviews.subtitle}</p>
      </header>
      <StudioReviewsPage providerId={providerId} initialFilter={initialFilter} />
    </section>
  );
}
