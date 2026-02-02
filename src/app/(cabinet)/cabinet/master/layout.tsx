import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { hasMasterProfile } from "@/lib/auth/roles";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { MasterCabinetTopbar } from "@/features/master/components/master-cabinet-topbar";

export default async function MasterCabinetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const hasProfile = await hasMasterProfile(user.id);
  if (!hasProfile) redirect("/403");

  const masterId = await getCurrentMasterProviderId(user.id);
  const [master, notificationsCount] = await Promise.all([
    prisma.provider.findUnique({
      where: { id: masterId },
      select: { name: true, ratingAvg: true, rating: true },
    }),
    prisma.notification.count({
      where: { userId: user.id, readAt: null },
    }),
  ]);

  if (!master) redirect("/403");

  const rating = master.ratingAvg > 0 ? master.ratingAvg : master.rating;
  const ratingLabel = `⭐${rating.toFixed(1)}`;

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <MasterCabinetTopbar
        masterName={master.name}
        ratingLabel={ratingLabel}
        notificationsCount={notificationsCount}
      />
      <main className="min-w-0">{children}</main>
    </section>
  );
}
