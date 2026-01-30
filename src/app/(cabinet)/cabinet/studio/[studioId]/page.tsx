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
import { StudioMemberServicesPanel } from "@/features/cabinet/components/studio-member-services-panel";
import { StudioSchedulePanel } from "@/features/cabinet/components/studio-schedule-panel";
import { MasterSchedulePanel } from "@/features/cabinet/components/master-schedule-panel";
import { ProviderBookingsPanel } from "@/features/cabinet/components/provider-bookings-panel";
import { StudioProfileCard } from "@/features/cabinet/components/studio-profile-card";
import { MasterInfoCard } from "@/features/cabinet/components/master-info-card";

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
  hasMasterProfile: boolean;
  hasStudioProfile: boolean;
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
      ownerUserId: true,
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
  const isLegacyOwner = provider.ownerUserId === user.id || studio.ownerUserId === user.id;

  if (!membership && !isLegacyOwner) redirect("/403");

  if (provider.type !== "STUDIO") {
    redirect("/cabinet/master");
  }

  const membershipRoles = membership?.roles ?? [];
  const isOwner = membershipRoles.includes(StudioRole.OWNER) || isLegacyOwner;
  const isAdmin = isOwner || membershipRoles.includes(StudioRole.ADMIN);
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
    {
      id: "schedule",
      label: "Расписание",
      href: `/cabinet/studio/${p.studioId}?tab=schedule`,
    },
    { id: "masters", label: "Мастера", href: `/cabinet/studio/${p.studioId}?tab=masters` },
    { id: "services", label: "Услуги", href: `/cabinet/studio/${p.studioId}?tab=services` },
    {
      id: "profile",
      label: "Профиль студии",
      href: `/cabinet/studio/${p.studioId}?tab=profile`,
    },
    {
      id: "overrides",
      label: "Настройки",
      href: `/cabinet/studio/${p.studioId}?tab=overrides`,
    },
  ];

  const masterOnlyTabs: TabItem[] = [
    { id: "bookings", label: "Записи", href: `/cabinet/studio/${p.studioId}?tab=bookings` },
    {
      id: "schedule",
      label: "Расписание",
      href: `/cabinet/studio/${p.studioId}?tab=schedule`,
    },
    { id: "services", label: "Услуги", href: `/cabinet/studio/${p.studioId}?tab=services` },
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

  const renderTabs = (activeId: string) => <CabinetNavTabs activeId={activeId} items={tabs} />;

  if (tab === "profile") {
    const studioProfile = await prisma.provider.findUnique({
      where: { id: provider.id },
      select: {
        name: true,
        tagline: true,
        address: true,
        district: true,
        categories: true,
      },
    });

    if (!studioProfile) redirect("/cabinet/studio");

    return (
      <CabinetShell title="Кабинет студии" subtitle="Информация о студии.">
        <div className="flex items-center justify-between gap-3">
          {renderTabs(tab)}
          <Link
            href={`/providers/${provider.id}`}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Открыть публичную страницу
          </Link>
        </div>

        <StudioProfileCard provider={studioProfile} />
      </CabinetShell>
    );
  }

  if (tab === "master-profile") {
    const meResponse = await serverApiFetch<{ user: MeDto | null }>("/api/me");

    if (!meResponse.ok) {
      if (meResponse.error.code === "UNAUTHORIZED") redirect("/login");
      redirect("/403");
    }

    if (!meResponse.data.user) redirect("/login");

    const masterProfile = masterProvider
      ? await prisma.provider.findUnique({
          where: { id: masterProvider.id },
          select: { address: true },
        })
      : null;

    const roleLabel = isOwner
      ? "Владелец студии"
      : membershipRoles.includes(StudioRole.ADMIN)
        ? "Админ студии"
        : membershipRoles.includes(StudioRole.MASTER)
          ? "Мастер студии"
          : null;
    const canLeave =
      !isOwner &&
      (membershipRoles.includes(StudioRole.ADMIN) ||
        membershipRoles.includes(StudioRole.MASTER));

    return (
      <CabinetShell
        title="Кабинет студии"
        subtitle="Личные данные аккаунта мастера (ФИО, контакты, дата рождения, адрес)."
      >
        <div className="flex items-center justify-between gap-3">
          {renderTabs(tab)}
          {masterProvider ? (
            <Link
              href={`/providers/${masterProvider.id}`}
              className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
            >
              Открыть публичную страницу
            </Link>
          ) : null}
        </div>

        <ProfileForm initialUser={meResponse.data.user} showProfessionalCta={false} />

        {masterProfile ? (
          <MasterInfoCard
            address={masterProfile.address}
            studio={{
              id: studio.id,
              name: provider.name,
              roleLabel,
              canLeave,
            }}
          />
        ) : (
          <div className="rounded-2xl border p-5 text-sm text-neutral-600">
            Не найден профиль мастера для студийного кабинета.
          </div>
        )}

        {masterProvider ? (
          <div className="rounded-2xl border p-5">
            <div className="text-sm font-semibold">Услуги мастера в студии</div>
            <div className="mt-1 text-sm text-neutral-600">
              Настройте услуги, которые доступны клиентам в этой студии.
            </div>
            <Link
              href={`/cabinet/studio/${p.studioId}?tab=services`}
              className="mt-3 inline-flex rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
            >
              Настроить услуги
            </Link>
          </div>
        ) : null}
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

        <StudioMastersPanel studioId={provider.id} canManage={isAdmin} />
      </CabinetShell>
    );
  }

  if (tab === "services") {
    return (
      <CabinetShell title="Кабинет студии" subtitle="Управляйте списком услуг и ценами.">
        {renderTabs("services")}

        {isAdmin ? (
          <div className="space-y-6">
            <section className="rounded-2xl border p-5">
              <div className="text-sm font-semibold">Каталог студии</div>
              <div className="mt-1 text-sm text-neutral-600">
                Создавайте услуги студии и управляйте их доступностью.
              </div>
              <div className="mt-4">
                <StudioServicesPanel studioId={provider.id} />
              </div>
            </section>

            <section className="rounded-2xl border p-5">
              <div className="text-sm font-semibold">Услуги мастера</div>
              <div className="mt-1 text-sm text-neutral-600">
                Выберите мастера и настройте доступные ему услуги.
              </div>
              <div className="mt-4">
                <StudioOverridesPanel studioId={provider.id} />
              </div>
            </section>
          </div>
        ) : (
          <StudioMemberServicesPanel studioId={provider.id} />
        )}
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
      subtitle={isMasterOnly ? "Мои записи." : "Управляйте записями и профилем студии."}
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
