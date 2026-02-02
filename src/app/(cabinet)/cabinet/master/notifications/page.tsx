import { redirect } from "next/navigation";
import { MembershipStatus } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { MasterNotificationsPage } from "@/features/master/components/master-notifications-page";

export default async function MasterNotificationsRoutePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const phone = user.phone ?? null;

  const invites = phone
    ? await prisma.studioInvite.findMany({
        where: { phone, status: MembershipStatus.PENDING },
        select: {
          id: true,
          studio: {
            select: {
              id: true,
              provider: {
                select: {
                  name: true,
                  tagline: true,
                  avatarUrl: true,
                  ratingAvg: true,
                  address: true,
                  district: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      readAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  });

  return (
    <MasterNotificationsPage
      invites={invites}
      notifications={notifications.map((note) => ({
        ...note,
        readAt: note.readAt ? note.readAt.toISOString() : null,
        createdAt: note.createdAt.toISOString(),
      }))}
      unreadCount={unreadCount}
      hasPhone={Boolean(phone)}
    />
  );
}

