import Link from "next/link";
import { redirect } from "next/navigation";
import { MembershipStatus, ProviderType, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { CabinetShell } from "@/features/cabinet/components/cabinet-shell";
import { CabinetNavTabs } from "@/features/cabinet/components/cabinet-nav-tabs";
import { ProfileForm } from "@/features/cabinet/components/profile-form";
import { StudioMastersPanel } from "@/features/cabinet/components/studio-masters-panel";
import { StudioServicesPanel } from "@/features/cabinet/components/studio-services-panel";
import { StudioOverridesPanel } from "@/features/cabinet/components/studio-overrides-panel";
import { StudioSchedulePanel } from "@/features/cabinet/components/studio-schedule-panel";
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

type SearchParams = { tab?: string; scope?: string };

type StudioProviderInfo = {
  id: string;
  type: "STUDIO" | "MASTER";
  name: string;
  tagline: string;
  ownerUserId: string | null;
};

type MasterProviderInfo = {
  id: string;
  name: string;
  tagline: string;
};

type TabItem = { id: string; label: string; href: string };

export default async function StudioCabinetByIdPage(props: {
  params: Promise<{ studioId: string }> | { studioId: string };
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const p = props.params instanceof Promise ? await props.params : props.params;
  const sp =
    props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;

  const studio = await prisma.studio.findUnique({
    where: { id: p.studioId },
    select: {
      id: true,
      provider: {
        select: {
          id: true,
          type: true,
          name: true,
          tagline: true,
          ownerUserId: true,
        },
      },
    },
  });

  if (!studio) redirect("/cabinet/studio");

  const membership = await prisma.studioMembership.findFirst({
    where: { studioId: studio.id, userId: user.id, status: MembershipStatus.ACTIVE },
    select: { id: true, roles: true },
  });

  const provider = studio.provider as StudioProviderInfo;
  const isLegacyOwner = provider.ownerUserId === user.id;

  if (!membership && !isLegacyOwner) redirect("/403");

  if (provider.type !== "STUDIO") {
    redirect("/cabinet/master");
  }

  const membershipRoles = membership?.roles ?? [];
  const isAdmin = membershipRoles.includes(StudioRole.ADMIN) || isLegacyOwner;
  const isMaster = membershipRoles.includes(StudioRole.MASTER);
  const isMasterOnly = isMaster && !isAdmin;
  const isAdminAndMaster = isAdmin && isMaster;

  const masterProvider: MasterProviderInfo | null = isMaster
    ? await prisma.provider.findFirst({
        where: {
          ownerUserId: user.id,
          type: ProviderType.MASTER,
          studioId: provider.id,
        },
        select: { id: true, name: true, tagline: true },
      })
    : null;

  const adminTabs: TabItem[] = [
    { id: "bookings", label: "Записи", href: `/cabinet/studio/${p.studioId}?tab=bookings` },
    { id: "schedule", label: "Расписание", href: `/cabinet/studio/${p.studioId}?tab=schedule` },
    { id: "masters", label: "Мастера", href: `/cabinet/studio/${p.studioId}?tab=masters` },
    { id: "services", label: "Услуги", href: `/cabinet/studio/${p.studioId}?tab=services` },
    { id: "profile", label: "Профиль студии", href: `/cabinet/studio/${p.studioId}?tab=profile` },
    { id: "overrides", label: "Настройки", href: `/cabinet/studio/${p.studioId}?tab=overrides` },
  ];

  const masterOnlyTabs: TabItem[] = [
    { id: "bookings", label: "Записи", href: `/cabinet/studio/${p.studioId}?tab=bookings` },
    { id: "schedule", label: "Расписание", href: `/cabinet/studio/${p.studioId}?tab=schedule` },
    {
      id: "master-profile",
      label: "Профиль мастера",
      href: `/cabinet/studio/${p.studioId}?tab=master-profile`,
    },
  ];

  const masterProfileTab: TabItem = {
    id: "master-profile",
    label: "Профиль мастера",
    href: `/cabinet/studio/${p.studioId}?tab=master-profile`,
  };

  const tabs: TabItem[] = isAdminAndMaster
    ? [...adminTabs, masterProfileTab]
    : isMasterOnly
      ? masterOnlyTabs
      : adminTabs;

  const allowedTabs = new Set(tabs.map((item) => item.id));
  const requestedTab = sp?.tab ?? "";
  const tab = allowedTabs.has(requestedTab) ? requestedTab : "bookings";

  const bookingScope = isAdminAndMaster
    ? sp?.scope === "my"
      ? "my"
      : "all"
    : null;

  const bookingEndpoint = (() => {
    if (isMasterOnly) {
      return masterProvider ? `/api/masters/${masterProvider.id}/bookings` : null;
    }

    if (isAdminAndMaster && bookingScope === "my") {
      return masterProvider ? `/api/masters/${masterProvider.id}/bookings` : null;
    }

    return `/api/bookings?providerId=${provider.id}`;
  })();

  const renderTabs = (activeId: string) => (
    <CabinetNavTabs activeId={activeId} items={tabs} />
  );

  if (tab === "profile" || tab === "master-profile") {
    const meResponse = await serverApiFetch<{ user: MeDto | null }>("/api/me");

    if (!meResponse.ok) {
      if (meResponse.error.code === "UNAUTHORIZED") redirect("/login");
      redirect("/403");
    }

    if (!meResponse.data.user) redirect("/login");

    const isMasterProfile = tab === "master-profile";
    const title = isMasterProfile ? "Профиль мастера" : "Профиль студии";
    const subtitle = isMasterProfile
      ? "Личные данные аккаунта мастера (ФИО, контакты, дата рождения, адрес)."
      : "Личные данные владельца/аккаунта (ФИО, контакты, дата рождения, адрес).";
    const profileLink = isMasterProfile ? masterProvider?.id : provider.id;

    return (
      <CabinetShell title="Кабинет студии" subtitle={subtitle}>
        <div className="flex items-center justify-between gap-3">
          {renderTabs(tab)}
          {profileLink ? (
            <Link
              href={`/providers/${profileLink}`}
              className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
            >
              Открыть публичную страницу
            </Link>
          ) : null}
        </div>

        <ProfileForm initialUser={meResponse.data.user} showProfessionalCta={false} />

        <section className="rounded-2xl border p-5">
          <h3 className="text-sm font-semibold">Дальше (следующий шаг)</h3>
          <p className="mt-2 text-sm text-neutral-600">
            Отдельно сделаем форму “{title}” (название, адрес, район, описание,
            категории) — это поля Provider.
          </p>
        </section>
      </CabinetShell>
    );
  }

  if (tab === "masters") {
    return (
      <CabinetShell
        title="Кабинет студии"
        subtitle="Добавляйте и приглашайте мастеров в студию."
      >
        {renderTabs("masters")}

        <StudioMastersPanel studioId={provider.id} />
      </CabinetShell>
    );
  }

  if (tab === "services") {
    return (
      <CabinetShell
        title="Кабинет студии"
        subtitle="Управляйте списком услуг и ценами."
      >
        {renderTabs("services")}

        <StudioServicesPanel studioId={provider.id} />
      </CabinetShell>
    );
  }

  if (tab === "overrides") {
    return (
      <CabinetShell title="Кабинет студии" subtitle="Настройки услуг и расписания.">
        {renderTabs("overrides")}

        <StudioOverridesPanel studioId={provider.id} />
      </CabinetShell>
    );
  }

  if (tab === "schedule") {
    return (
      <CabinetShell title="Кабинет студии" subtitle="Расписание мастеров.">
        {renderTabs("schedule")}

        {isMasterOnly ? (
          masterProvider ? (
            <MasterSchedulePanel masterId={masterProvider.id} />
          ) : (
            <div className="rounded-2xl border p-5 text-sm text-neutral-600">
              Не найден профиль мастера для расписания.
            </div>
          )
        ) : (
          <StudioSchedulePanel studioId={provider.id} />
        )}
      </CabinetShell>
    );
  }

  return (
    <CabinetShell
      title="Кабинет студии"
      subtitle={
        isMasterOnly ? "Мои записи." : "Управляйте записями и профилем студии."
      }
    >
      <div className="flex items-center justify-between gap-3">
        {renderTabs("bookings")}
        <div className="flex items-center gap-3">
          {isAdminAndMaster ? (
            <div className="inline-flex items-center gap-1 rounded-2xl border p-1">
              <Link
                href={`/cabinet/studio/${p.studioId}?tab=bookings&scope=all`}
                className={`rounded-xl px-3 py-1 text-sm font-medium ${
                  bookingScope === "all" ? "bg-black text-white" : "hover:bg-neutral-50"
                }`}
              >
                Все
              </Link>
              <Link
                href={`/cabinet/studio/${p.studioId}?tab=bookings&scope=my`}
                className={`rounded-xl px-3 py-1 text-sm font-medium ${
                  bookingScope === "my" ? "bg-black text-white" : "hover:bg-neutral-50"
                }`}
              >
                Мои
              </Link>
            </div>
          ) : null}
          <Link
            href={`/providers/${provider.id}`}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Открыть публичную страницу
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border p-5">
        <div>
          <h2 className="text-lg font-semibold">
            {isMasterOnly ? "Мои записи" : "Записи студии"}
          </h2>
          <div className="mt-2 text-neutral-700">
            <div className="font-medium">{provider.name}</div>
            <div className="text-sm text-neutral-600">{provider.tagline}</div>
          </div>
        </div>

        <div className="mt-4">
          {bookingEndpoint ? (
            <ProviderBookingsPanel endpoint={bookingEndpoint} />
          ) : (
            <div className="rounded-2xl border p-5 text-sm text-neutral-600">
              Не найден профиль мастера для отображения записей.
            </div>
          )}
        </div>
      </section>
    </CabinetShell>
  );
}