import Link from "next/link";
import { redirect } from "next/navigation";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { CabinetShell } from "@/features/cabinet/components/cabinet-shell";
import { CabinetNavTabs } from "@/features/cabinet/components/cabinet-nav-tabs";
import { RoleSwitch } from "@/features/cabinet/components/role-switch";
import { ProfileForm } from "@/features/cabinet/components/profile-form";
import { MasterServicesPanel } from "@/features/cabinet/components/master-services-panel";
import { MasterSchedulePanel } from "@/features/cabinet/components/master-schedule-panel";
import { ProviderBookingsPanel } from "@/features/cabinet/components/provider-bookings-panel";

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

export default async function MasterCabinetPage(props: {
  searchParams?: Promise<{ tab?: string }> | { tab?: string };
}) {
  const sp =
    props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;

  const tab =
    sp?.tab === "profile" || sp?.tab === "services" || sp?.tab === "schedule"
      ? sp.tab
      : "bookings";

  const providerResponse = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
    "/api/providers/me"
  );

  if (!providerResponse.ok) {
    if (providerResponse.error.code === "UNAUTHORIZED") redirect("/login");
    if (providerResponse.error.code === "FORBIDDEN_ROLE") redirect("/403");

    return (
      <CabinetShell
        title="Кабинет мастера"
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
        title="Кабинет мастера"
        subtitle="Создайте профиль мастера, чтобы принимать записи."
        right={<RoleSwitch value="provider" clientHref="/cabinet/client" providerHref="/cabinet" />}
      >
        <div className="rounded-2xl border p-6">
          <p className="text-neutral-700">
            У вас пока нет профиля провайдера. Создайте профиль мастера, чтобы начать принимать
            записи.
          </p>

          <form action={createMyMasterProviderAction} className="mt-6">
            <button className="rounded-xl bg-black text-white px-4 py-2 font-medium">
              Создать профиль мастера
            </button>
          </form>
        </div>
      </CabinetShell>
    );
  }

  if (provider.type !== "MASTER") {
    redirect("/cabinet/studio");
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
        title="Кабинет мастера"
        subtitle="Личные данные аккаунта (ФИО, контакты, дата рождения, адрес)."
        right={<RoleSwitch value="provider" clientHref="/cabinet/client" providerHref="/cabinet" />}
      >
        <div className="flex items-center justify-between gap-3">
          <CabinetNavTabs
            activeId="profile"
            items={[
              { id: "bookings", label: "Записи", href: "/cabinet/master?tab=bookings" },
              { id: "services", label: "Услуги", href: "/cabinet/master?tab=services" },
              { id: "schedule", label: "Расписание", href: "/cabinet/master?tab=schedule" },
              { id: "profile", label: "Профиль", href: "/cabinet/master?tab=profile" },
            ]}
          />
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
            Отдельно сделаем форму “Профиль мастера” (имя/слоган/адрес/район/категории) — это поля
            Provider.
          </p>
        </section>
      </CabinetShell>
    );
  }

  if (tab === "services") {
    return (
      <CabinetShell
        title="Кабинет мастера"
        subtitle="Управляйте списком услуг и ценами."
        right={<RoleSwitch value="provider" clientHref="/cabinet/client" providerHref="/cabinet" />}
      >
        <CabinetNavTabs
          activeId="services"
          items={[
            { id: "bookings", label: "Записи", href: "/cabinet/master?tab=bookings" },
            { id: "services", label: "Услуги", href: "/cabinet/master?tab=services" },
            { id: "schedule", label: "Расписание", href: "/cabinet/master?tab=schedule" },
            { id: "profile", label: "Профиль", href: "/cabinet/master?tab=profile" },
          ]}
        />

        <MasterServicesPanel masterId={provider.id} />
      </CabinetShell>
    );
  }

  if (tab === "schedule") {
    return (
      <CabinetShell
        title="Кабинет мастера"
        subtitle="Настройте недельное расписание."
        right={<RoleSwitch value="provider" clientHref="/cabinet/client" providerHref="/cabinet" />}
      >
        <CabinetNavTabs
          activeId="schedule"
          items={[
            { id: "bookings", label: "Записи", href: "/cabinet/master?tab=bookings" },
            { id: "services", label: "Услуги", href: "/cabinet/master?tab=services" },
            { id: "schedule", label: "Расписание", href: "/cabinet/master?tab=schedule" },
            { id: "profile", label: "Профиль", href: "/cabinet/master?tab=profile" },
          ]}
        />

        <MasterSchedulePanel masterId={provider.id} />
      </CabinetShell>
    );
  }

  return (
    <CabinetShell
      title="Кабинет мастера"
      subtitle="Управляйте записями и профилем мастера."
      right={<RoleSwitch value="provider" clientHref="/cabinet/client" providerHref="/cabinet" />}
    >
      <div className="flex items-center justify-between gap-3">
        <CabinetNavTabs
          activeId="bookings"
          items={[
            { id: "bookings", label: "Записи", href: "/cabinet/master?tab=bookings" },
            { id: "services", label: "Услуги", href: "/cabinet/master?tab=services" },
            { id: "schedule", label: "Расписание", href: "/cabinet/master?tab=schedule" },
            { id: "profile", label: "Профиль", href: "/cabinet/master?tab=profile" },
          ]}
        />
        <Link
          href={`/providers/${provider.id}`}
          className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          Открыть публичную страницу
        </Link>
      </div>

      <section className="rounded-2xl border p-5">
        <div>
          <h2 className="text-lg font-semibold">Мои записи</h2>
          <div className="mt-2 text-neutral-700">
            <div className="font-medium">{provider.name}</div>
            <div className="text-sm text-neutral-600">{provider.tagline}</div>
          </div>
        </div>

        <div className="mt-4">
          <ProviderBookingsPanel endpoint={`/api/masters/${provider.id}/bookings`} />
        </div>
      </section>
    </CabinetShell>
  );
}

async function createMyMasterProviderAction() {
  "use server";

  const response = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
    "/api/providers/me",
    { method: "POST" }
  );

  if (!response.ok) {
    if (response.error.code === "UNAUTHORIZED") redirect("/login");
    if (response.error.code === "FORBIDDEN_ROLE") redirect("/403");
  }

  redirect("/cabinet/master");
}
