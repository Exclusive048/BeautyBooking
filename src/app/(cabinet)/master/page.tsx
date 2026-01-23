import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export default async function MasterPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.accountType !== "MASTER") redirect("/403");

  const provider = await prisma.provider.findFirst({
    where: { ownerUserId: user.id, type: "MASTER" },
    include: { services: true },
  });

  if (!provider) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Кабинет мастера</h1>
        <p className="mt-2 text-neutral-600">
          У вас пока нет профиля мастера. Создайте его, чтобы получать записи.
        </p>

        <form action={createMyProviderAction} className="mt-6">
          <button className="rounded-xl bg-black text-white px-4 py-2 font-medium">
            Создать профиль мастера
          </button>
        </form>
      </div>
    );
  }

  const bookings = await prisma.booking.findMany({
    where: { providerId: provider.id },
    orderBy: { createdAt: "desc" },
    include: { service: true },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Кабинет мастера</h1>
          <div className="mt-2 text-neutral-700">
            <div className="font-medium">{provider.name}</div>
            <div className="text-sm text-neutral-600">{provider.tagline}</div>
          </div>
        </div>

        <Link
          href={`/providers/${provider.id}`}
          className="rounded-xl border px-4 py-2 font-medium hover:bg-neutral-50"
        >
          Открыть публичный профиль
        </Link>
      </div>

      <section className="rounded-2xl border p-5">
        <h2 className="text-lg font-semibold">Записи</h2>

        {bookings.length === 0 ? (
          <p className="mt-3 text-neutral-600">Пока нет записей.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{b.clientName}</div>
                  <div className="text-sm text-neutral-600">{b.status}</div>
                </div>
                <div className="mt-1 text-sm text-neutral-700">
                  {b.slotLabel} • {b.service.name} • {b.clientPhone}
                </div>
                {b.comment ? (
                  <div className="mt-2 text-sm text-neutral-600">{b.comment}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function createMyProviderAction() {
  "use server";
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.accountType !== "MASTER") redirect("/403");

  // ✅ Фикс: ищем существующего провайдера ТОЛЬКО типа MASTER
  const existing = await prisma.provider.findFirst({
    where: { ownerUserId: user.id, type: "MASTER" },
  });

  if (!existing) {
    await prisma.provider.create({
      data: {
        ownerUserId: user.id,
        type: "MASTER",
        name: "Новый мастер",
        tagline: "Добавьте описание в настройках",
        rating: 0,
        reviews: 0,
        priceFrom: 0,
        address: "Адрес не указан",
        district: "Район не указан",
        categories: [],
        availableToday: false,
      },
    });
  }

  redirect("/master");
}
