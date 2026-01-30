import { redirect } from "next/navigation";
import { MembershipStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export default async function InvitesPage() {
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
              provider: { select: { name: true, tagline: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    select: { id: true, title: true, body: true, readAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">???????????</h1>
        <p className="text-sm text-neutral-600">
          ??????? ? ??????? ?? ???????.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">???????????</h2>
        {!phone ? (
          <div className="rounded-2xl border p-4 text-sm text-neutral-600">
            ? ??????? ??? ????????. ???????? ????? ? ???????, ????? ???????? ???????????.
          </div>
        ) : invites.length === 0 ? (
          <div className="rounded-2xl border p-4 text-sm text-neutral-600">
            ??? ???????? ???????????.
          </div>
        ) : (
          <div className="space-y-3">
            {invites.map((invite) => (
              <div key={invite.id} className="rounded-2xl border p-4">
                <div className="text-sm text-neutral-500">??????</div>
                <div className="text-lg font-semibold">{invite.studio.provider.name}</div>
                <div className="text-sm text-neutral-600">{invite.studio.provider.tagline}</div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={`/api/invites/${invite.id}/accept`} method="POST">
                    <button className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium">
                      ???????
                    </button>
                  </form>
                  <form action={`/api/invites/${invite.id}/reject`} method="POST">
                    <button className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50">
                      ?????????
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">?????? ? ??????</h2>
          {unreadCount > 0 ? (
            <form action="/api/notifications/read-all" method="POST">
              <button className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-neutral-50">
                ???????? ??? ???????????
              </button>
            </form>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <div className="rounded-2xl border p-4 text-sm text-neutral-600">
            ???? ??? ???????????.
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((note) => (
              <div key={note.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{note.title}</div>
                  <div className="text-xs text-neutral-500">
                    {note.createdAt.toLocaleString("ru-RU")}
                  </div>
                </div>
                {note.body ? (
                  <div className="mt-1 text-sm text-neutral-700">{note.body}</div>
                ) : null}
                {!note.readAt ? (
                  <div className="mt-2 text-xs text-blue-600">?????</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
