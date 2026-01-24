import { redirect } from "next/navigation";
import { BookingStatus } from "@prisma/client";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { CabinetShell, CabinetTabs } from "@/components/cabinet/cabinet-shell"; 
import { RoleSwitch } from "@/components/cabinet/role-switch";
import { ProfileForm } from "@/components/cabinet/profile-form";

type MeDto = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  birthDate: string | null;
  address: string | null;
  geoLat: number | null;
  geoLng: number | null;
};

export default async function ClientCabinetPage(props: {
  searchParams?: Promise<{ tab?: string }> | { tab?: string };
}) {
  const sp =
    props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;

  const tab = (sp?.tab === "profile" ? "profile" : "bookings") as "bookings" | "profile";

  if (tab === "profile") {
    const meResponse = await serverApiFetch<{ user: MeDto | null }>("/api/me");

    if (!meResponse.ok) {
      if (meResponse.error.code === "UNAUTHORIZED") redirect("/login");
      redirect("/403");
    }
    if (!meResponse.data.user) redirect("/login");

    return (
      <CabinetShell
        title="Кабинет клиента"
        subtitle="Личные данные и настройки."
        right={<RoleSwitch value="client" clientHref="/cabinet/client" providerHref="/cabinet" />}
      >
        <div className="flex items-center justify-between">
          <CabinetTabs active="profile" baseHref="/cabinet/client" />
        </div>

        <ProfileForm initialUser={meResponse.data.user} />
      </CabinetShell>
    );
  }

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
    <CabinetShell
      title="Кабинет клиента"
      subtitle="Ваши записи к мастерам и в студии."
      right={<RoleSwitch value="client" clientHref="/cabinet/client" providerHref="/cabinet" />}
    >
      <div className="flex items-center justify-between">
        <CabinetTabs active="bookings" baseHref="/cabinet/client" />
      </div>

      {bookingsError ? (
        <div className="rounded-2xl border p-6 text-red-600">Ошибка загрузки: {bookingsError}</div>
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
              {b.comment ? <div className="mt-2 text-sm text-neutral-600">{b.comment}</div> : null}
            </div>
          ))}
        </div>
      )}
    </CabinetShell>
  );
}
