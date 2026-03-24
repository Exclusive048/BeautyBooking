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
        <p className="text-sm text-text-sec">{"\u041d\u043e\u0432\u044b\u0435 \u0438 \u043d\u0435\u043e\u0442\u0432\u0435\u0447\u0435\u043d\u043d\u044b\u0435 \u043e\u0442\u0437\u044b\u0432\u044b \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432 \u0441\u0442\u0443\u0434\u0438\u0438."}</p>
      </header>
      <StudioReviewsPage providerId={providerId} initialFilter={initialFilter} />
    </section>
  );
}
