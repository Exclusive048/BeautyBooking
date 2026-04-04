import { ProviderType } from "@prisma/client";
import { redirect } from "next/navigation";
import { MasterCabinetTopbar } from "@/features/master/components/master-cabinet-topbar";
import { MasterSidebar } from "@/features/master/components/master-sidebar";
import { MasterBottomNav } from "@/features/master/components/master-bottom-nav";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";

export default async function MasterCabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const master = await prisma.provider.findFirst({
    where: { ownerUserId: userId, type: ProviderType.MASTER },
    select: {
      ratingAvg: true,
      rating: true,
      studioId: true,
      masterProfile: { select: { id: true } },
      studio: { select: { name: true } },
      publicUsername: true,
    },
  });
  if (!master || !master.masterProfile) redirect("/403");

  const rating = master.ratingAvg > 0 ? master.ratingAvg : master.rating;
  const ratingLabel =
    rating > 0
      ? `${UI_TEXT.master.sidebar.ratingLabel} ${rating.toFixed(1)}`
      : UI_TEXT.master.sidebar.noRating;
  const studioName = master.studio?.name ?? null;

  return (
    <div className="flex min-h-screen bg-bg-base">
      {/* Desktop sidebar */}
      <div className="hidden lg:block lg:shrink-0 border-r border-border-subtle">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <MasterSidebar
            ratingLabel={ratingLabel}
            publicUsername={master.publicUsername}
          />
        </div>
      </div>

      {/* Main content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar — visible only on mobile/tablet (lg:hidden) */}
        <div className="lg:hidden">
          <MasterCabinetTopbar
            ratingLabel={ratingLabel}
            studioName={studioName}
            isStudioMember={Boolean(master.studioId)}
          />
        </div>

        <main className="min-w-0 flex-1 p-4 pb-24 lg:p-8 lg:pb-8">
          <div className="mx-auto w-full max-w-6xl">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MasterBottomNav />
    </div>
  );
}
