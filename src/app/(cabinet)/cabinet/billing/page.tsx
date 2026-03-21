import { AccountType } from "@prisma/client";
import { redirect } from "next/navigation";
import { BillingPage } from "@/features/billing/components/billing-page";
import { MasterCabinetTopbar } from "@/features/master/components/master-cabinet-topbar";
import { StudioNavbar } from "@/features/studio-cabinet/components/studio-navbar";
import { hasMasterProfile } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { providerPublicUrl } from "@/lib/public-urls";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { UI_TEXT } from "@/lib/ui/text";

export const runtime = "nodejs";

type PageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams ?? {};
  const rawScope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  const scope = rawScope === "MASTER" || rawScope === "STUDIO" ? rawScope : null;

  if (!scope) {
    redirect("/cabinet/profile");
  }

  const hasMaster = user.roles.includes(AccountType.MASTER);
  const hasStudio = user.roles.includes(AccountType.STUDIO) || user.roles.includes(AccountType.STUDIO_ADMIN);

  if (scope === "MASTER" && !hasMaster) {
    redirect("/cabinet/profile");
  }
  if (scope === "STUDIO" && !hasStudio) {
    redirect("/cabinet/profile");
  }

  if (scope === "MASTER") {
    const hasProfile = await hasMasterProfile(user.id);
    if (!hasProfile) {
      redirect("/403");
    }

    const masterId = await getCurrentMasterProviderId(user.id);
    const master = await prisma.provider.findUnique({
      where: { id: masterId },
      select: { ratingAvg: true, rating: true, studioId: true },
    });
    if (!master) {
      redirect("/403");
    }

    const rating = master.ratingAvg > 0 ? master.ratingAvg : master.rating;
    const ratingLabel = rating.toFixed(1);
    const studioName = master.studioId
      ? (
          await prisma.provider.findUnique({
            where: { id: master.studioId },
            select: { name: true },
          })
        )?.name ?? null
      : null;

    return (
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
        <MasterCabinetTopbar ratingLabel={ratingLabel} studioName={studioName} />
        <main className="min-w-0">
          <BillingPage scope="MASTER" />
        </main>
      </section>
    );
  }

  const hasStudioAccess = await hasStudioAdminAccess(user.id);
  if (!hasStudioAccess) {
    redirect("/403");
  }

  let providerId: string;
  try {
    ({ providerId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, name: true, publicUsername: true },
  });

  const studioName = provider?.name ?? UI_TEXT.studioCabinet.layout.studioFallbackName;
  const publicHref = provider?.publicUsername
    ? providerPublicUrl({ id: provider.id, publicUsername: provider.publicUsername }, "studio-cabinet")
    : "/cabinet/studio/settings";
  const publicHint = provider?.publicUsername ? null : UI_TEXT.studioCabinet.layout.publicUsernameHint;

  return (
    <div className="min-h-dvh bg-bg-page">
      <StudioNavbar studioName={studioName} publicHref={publicHref} publicHint={publicHint} />
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6">
        <BillingPage scope="STUDIO" />
      </div>
    </div>
  );
}
