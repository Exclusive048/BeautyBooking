import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingStatus } from "@prisma/client";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { CabinetShell, CabinetTabs } from "@/features/cabinet/components/cabinet-shell";
import { RoleSwitch } from "@/features/cabinet/components/role-switch";
import { ProfileForm } from "@/features/cabinet/components/profile-form";

type MeDto = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  birthDate: string | null; // yyyy-mm-dd
  address: string | null;
  geoLat: number | null;
  geoLng: number | null;
};

export default async function StudioCabinetPage(props: {
  searchParams?: Promise<{ tab?: string }> | { tab?: string };
}) {
  const sp =
    props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;

  const tab = (sp?.tab === "profile" ? "profile" : "bookings") as "bookings" | "profile";

  const providerResponse = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
    "/api/providers/me"
  );

  if (!providerResponse.ok) {
    if (providerResponse.error.code === "UNAUTHORIZED") redirect("/login");
    if (providerResponse.error.code === "FORBIDDEN_ROLE") redirect("/403");

    return (
      <CabinetShell
        title="Кабинет студии"
        subtitle="Ошибка загрузки данных профиля."
        right={<RoleSwitch value="provider" clientHref="/cabinet/client" providerHref="/cabinet" />}
      >
        <div className="rounded-2xl border p-6 text-red-600">
          Ошибка сервера: {providerResponse.error.message}
        </div>
      </CabinetShell>
    );
  }

  const provider = providerResponse.data.provider;

  if (!provider) {
    return (
      <CabinetShell
        title="Кабинет студии"
        subtitle="Создайте профиль студии, чтобы принимать записи."
        right={<RoleSwitch value="provider" clientHref="/cabinet/client" providerHref="/cabinet" />}
      >
        <div className="rounded-2xl border p-6">
          <p className="text-neutral-700">
            У вас пока нет профиля провайдера. Создайте профиль студии, чтобы начать принимать
            записи.
          </p>

          <form action={createMyStudioProviderAction} className="mt-6">
            <button className="rounded-xl bg-black text-white px-4 py-2 font-medium">
              Создать профиль студии
            </button>
          </form>
        </div>
      </CabinetShell>
    );
  }

  // Если вдруг человек попал не в тот кабинет — отправим в правильный
  if (provider.type !== "STUDIO") {
    redirect("/cabinet/master");
  }

  if (tab === "profile") {
    const meResponse = await serverApiFetch<{ user: MeDto | null }>("/api/me");

    if (!meResponse.ok) {
      if (meResponse.error.code === "UNAUTHORIZED") redirect("/login");
      redirect("/403");
    }

    if (!meResponse.data.user) redirect("/login");

    return (
      <CabinetShell
        title="Кабинет студии"
        subtitle="Личные данные владельца/аккаунта (ФИО, контакты, дата рождения, адрес)."
        right={<RoleSwitch value="provider" clientHref="/cabinet/client" providerHref="/cabinet" />}
      >
        <div className="flex items-center justify-between gap-3">
          <CabinetTabs active="profile" baseHref="/cabinet/studio" />
          <Link
            href={`/providers/${provider.id}`}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Открыть публичную страницу
          </Link>
        </div>

        <ProfileForm initialUser={meResponse.data.user} />

        <section className="rounded-2xl border p-5">
          <h3 className="text-sm font-semibold">Дальше (следующий шаг)</h3>
          <p className="mt-2 text-sm text-neutral-600">
            Отдельно сделаем форму “Профиль студии” (название, адрес, район, описание, контакты) —
            это поля Provider.
          </p>
        </section>
      </CabinetShell>
    );
  }

  const bookingsResponse = await serverApiFetch<{
    bookings: Array<{
      id: string;
      slotLabel: string;
      clientName: string;
      clientPhone: string;
      comment: string | null;
      status: BookingStatus;
      service: { name: string };
    }>;
  }>(`/api/bookings?providerId=${provider.id}`);

  const bookingsError = bookingsResponse.ok ? null : bookingsResponse.error.message;
  const bookings = bookingsResponse.ok ? bookingsResponse.data.bookings : [];

  return (
    <CabinetShell
      title="Кабинет студии"
      subtitle="Управляйте записями и профилем студии."
      right={<RoleSwitch value="provider" clientHref="/cabinet/client" providerHref="/cabinet" />}
    >
      <div className="flex items-center justify-between gap-3">
        <CabinetTabs active="bookings" baseHref="/cabinet/studio" />
        <Link
          href={`/providers/${provider.id}`}
          className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          Открыть публичную страницу
        </Link>
      </div>

      <section className="rounded-2xl border p-5">
        <div>
          <h2 className="text-lg font-semibold">Записи студии</h2>
          <div className="mt-2 text-neutral-700">
            <div className="font-medium">{provider.name}</div>
            <div className="text-sm text-neutral-600">{provider.tagline}</div>
          </div>
        </div>

        {bookingsError ? (
          <p className="mt-3 text-sm text-red-600">Ошибка загрузки: {bookingsError}</p>
        ) : bookings.length === 0 ? (
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
    </CabinetShell>
  );
}

async function createMyStudioProviderAction() {
  "use server";

  const response = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
    "/api/providers/me",
    { method: "POST" }
  );

  if (!response.ok) {
    if (response.error.code === "UNAUTHORIZED") redirect("/login");
    if (response.error.code === "FORBIDDEN_ROLE") redirect("/403");
  }

  redirect("/cabinet/studio");
}
