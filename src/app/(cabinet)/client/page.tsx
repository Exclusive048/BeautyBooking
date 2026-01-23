import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export default async function ClientCabinetPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // CLIENT гарантируем при логине, но пусть будет проверка
  if (!user.roles.includes("CLIENT")) redirect("/403");

  const bookings = await prisma.booking.findMany({
    where: { clientUserId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      provider: true,
      service: true,
    },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Мои записи</h1>
        <p className="mt-1 text-neutral-600 text-sm">
          Все ваши записи к мастерам и в студии.
        </p>
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-2xl border p-6 text-neutral-600">
          Пока нет записей. Найдите мастера в каталоге и запишитесь.
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div key={b.id} className="rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="font-medium">{b.provider.name}</div>
                <div className="text-sm text-neutral-600">{b.status}</div>
              </div>
              <div className="mt-1 text-sm text-neutral-700">
                {b.slotLabel} • {b.service.name}
              </div>
              <div className="mt-1 text-sm text-neutral-600">
                {b.provider.district} • {b.provider.address}
              </div>
              {b.comment ? (
                <div className="mt-2 text-sm text-neutral-600">{b.comment}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
