import { redirect } from "next/navigation";
import { MembershipStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export default async function InvitesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const phone = user.phone ?? null;
  if (!phone) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-4">
        <h1 className="text-2xl font-semibold">Приглашения</h1>
        <p className="text-sm text-neutral-600">
          В профиле нет телефона. Добавьте номер в профиле, чтобы получать приглашения.
        </p>
      </div>
    );
  }

  const invites = await prisma.studioInvite.findMany({
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
  });

  if (invites.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 space-y-4">
        <h1 className="text-2xl font-semibold">Приглашения</h1>
        <p className="text-sm text-neutral-600">Нет активных приглашений.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-4">
      <h1 className="text-2xl font-semibold">Приглашения</h1>
      <p className="text-sm text-neutral-600">
        Вас пригласили в студии. Примите приглашение или отклоните.
      </p>

      <div className="space-y-3">
        {invites.map((invite) => (
          <div key={invite.id} className="rounded-2xl border p-4">
            <div className="text-sm text-neutral-500">Студия</div>
            <div className="text-lg font-semibold">{invite.studio.provider.name}</div>
            <div className="text-sm text-neutral-600">{invite.studio.provider.tagline}</div>

            <div className="mt-4 flex flex-wrap gap-2">
              <form action={`/api/invites/${invite.id}/accept`} method="POST">
                <button className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium">
                  Принять
                </button>
              </form>
              <form action={`/api/invites/${invite.id}/reject`} method="POST">
                <button className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50">
                  Отклонить
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}