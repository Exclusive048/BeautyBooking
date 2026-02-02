import Link from "next/link";
import { redirect } from "next/navigation";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { CabinetShell } from "@/features/cabinet/components/cabinet-shell";
import { CabinetNavTabs } from "@/features/cabinet/components/cabinet-nav-tabs";
import { ProfileForm } from "@/features/cabinet/components/profile-form";
import { MasterSchedulePanel } from "@/features/cabinet/components/master-schedule-panel";
import { ProviderBookingsPanel } from "@/features/cabinet/components/provider-bookings-panel";
import { MasterServicesPanel } from "@/features/cabinet/components/master-services-panel";
import { AvatarEditor } from "@/features/media/components/avatar-editor";
import { PortfolioEditor } from "@/features/media/components/portfolio-editor";

type MeDto = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
  externalPhotoUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  birthDate: string | null; // yyyy-mm-dd
  address: string | null;
  geoLat: number | null;
  geoLng: number | null;
  hasMasterProfile: boolean;
  hasStudioProfile: boolean;
};

export default async function MasterCabinetPage(props: {
  searchParams?: Promise<{ tab?: string }> | { tab?: string };
}) {
  const sp =
    props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;

  const tab =
    sp?.tab === "profile" || sp?.tab === "schedule" || sp?.tab === "services"
      ? sp.tab
      : "bookings";

  const tabs = [
    { id: "bookings", label: "Записи клиентов", href: "/cabinet/master?tab=bookings" },
    { id: "schedule", label: "Расписание", href: "/cabinet/master?tab=schedule" },
    { id: "services", label: "Услуги", href: "/cabinet/master?tab=services" },
    { id: "profile", label: "Профиль мастера", href: "/cabinet/master?tab=profile" },
  ];

  const providerResponse = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
    "/api/providers/me?type=MASTER"
  );

  if (!providerResponse.ok) {
    if (providerResponse.error.code === "UNAUTHORIZED") redirect("/login");
    if (providerResponse.error.code === "FORBIDDEN_ROLE") redirect("/403");

    return (
      <CabinetShell
        title="Кабинет мастера"
        subtitle="Ошибка загрузки данных профиля."
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
      >
        <div className="rounded-2xl border p-6">
          <p className="text-neutral-700">
            У вас пока нет профиля провайдера. Создайте профиль мастера, чтобы начать
            принимать записи.
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
      >
        <div className="flex items-center justify-between gap-3">
          <CabinetNavTabs activeId="profile" items={tabs} />
          <Link
            href={`/providers/${provider.id}`}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Открыть публичную страницу
          </Link>
        </div>

        <ProfileForm initialUser={meResponse.data.user} showProfessionalCta={false} />

        <section className="rounded-2xl border p-5 space-y-4">
          <h3 className="text-lg font-semibold">Фото мастера</h3>
          <AvatarEditor entityType="MASTER" entityId={provider.id} fallbackUrl={provider.avatarUrl} />
          <PortfolioEditor entityType="MASTER" entityId={provider.id} />
        </section>
      </CabinetShell>
    );
  }

  if (tab === "schedule") {
    return (
      <CabinetShell title="Кабинет мастера" subtitle="Настройте недельное расписание.">
        <CabinetNavTabs activeId="schedule" items={tabs} />

        <MasterSchedulePanel masterId={provider.id} />
      </CabinetShell>
    );
  }

  if (tab === "services") {
    return (
      <CabinetShell title="Кабинет мастера" subtitle="Настройте услуги, которые доступны клиентам.">
        <CabinetNavTabs activeId="services" items={tabs} />

        <MasterServicesPanel />
      </CabinetShell>
    );
  }

  return (
    <CabinetShell title="Кабинет мастера" subtitle="Управляйте записями клиентов.">
      <div className="flex items-center justify-between gap-3">
        <CabinetNavTabs activeId="bookings" items={tabs} />
        <Link
          href={`/providers/${provider.id}`}
          className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          Открыть публичную страницу
        </Link>
      </div>

      <section className="rounded-2xl border p-5">
        <div>
          <h2 className="text-lg font-semibold">Записи клиентов</h2>
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
