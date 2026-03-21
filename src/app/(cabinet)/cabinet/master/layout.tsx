import { ProviderType } from "@prisma/client";
import { redirect } from "next/navigation";
import { MasterCabinetTopbar } from "@/features/master/components/master-cabinet-topbar";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

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
    },
  });
  if (!master || !master.masterProfile) redirect("/403");

  const rating = master.ratingAvg > 0 ? master.ratingAvg : master.rating;
  const ratingLabel = `*${rating.toFixed(1)}`;
  const studioName = master.studio?.name ?? null;

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <MasterCabinetTopbar
        ratingLabel={ratingLabel}
        studioName={studioName}
        isStudioMember={Boolean(master.studioId)}
      />
      <main className="min-w-0">{children}</main>
    </section>
  );
}
