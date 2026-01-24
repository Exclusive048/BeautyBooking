import { redirect } from "next/navigation";
import { BookingStatus } from "@prisma/client";
import { serverApiFetch } from "@/lib/api/server-fetch";

export default async function ClientCabinetPage() {
  const bookingsResponse = await serverApiFetch<{
    bookings: Array<{
      id: string;
      slotLabel: string;
      comment: string | null;
      status: BookingStatus;
      provider: { id: string; name: string; district: string; address: string };
      service: { name: string };
    }>;
  }>("/api/bookings/my");

  if (!bookingsResponse.ok) {
    if (bookingsResponse.error.code === "UNAUTHORIZED") redirect("/login");
    if (bookingsResponse.error.code === "FORBIDDEN") redirect("/403");
  }

  const bookingsError = bookingsResponse.ok ? null : bookingsResponse.error.message;
  const bookings = bookingsResponse.ok ? bookingsResponse.data.bookings : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Мои записи</h1>
        <p className="mt-1 text-neutral-600 text-sm">
          Все ваши записи к мастерам и в студии.
        </p>
      </div>

      {bookingsError ? (
        <div className="rounded-2xl border p-6 text-red-600">
          Ошибка загрузки: {bookingsError}
        </div>
      ) : bookings.length === 0 ? (
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
