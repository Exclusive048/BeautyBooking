import Link from "next/link";
import { redirect } from "next/navigation";
import { MembershipStatus } from "@prisma/client";
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

type SearchParams = { tab?: string };

type StudioProviderInfo = {
  id: string;
  type: "STUDIO" | "MASTER";
  name: string;
  tagline: string;
  ownerUserId: string | null;
};

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
    select: { id: true },
  });

  const provider = studio.provider as StudioProviderInfo;
  const isLegacyOwner = provider.ownerUserId === user.id;

  if (!membership && !isLegacyOwner) redirect("/403");

  if (provider.type !== "STUDIO") {
    redirect("/cabinet/master");
  }

  const tab =
    sp?.tab === "profile" ||
    sp?.tab === "masters" ||
    sp?.tab === "services" ||
    sp?.tab === "overrides" ||
    sp?.tab === "schedule"
      ? sp.tab
      : "bookings";

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
        subtitle="Личные данные аккаунта (ФИО, контакты, дата рождения, адрес)."
      >
        <div className="flex items-center justify-between gap-3">
          <CabinetNavTabs
            activeId="profile"
            items={[
              { id: "bookings", label: "Записи", href: `/cabinet/studio/${p.studioId}?tab=bookings` },
              { id: "masters", label: "Мастера", href: `/cabinet/studio/${p.studioId}?tab=masters` },
              { id: "services", label: "Услуги", href: `/cabinet/studio/${p.studioId}?tab=services` },
              { id: "overrides", label: "Исключения", href: `/cabinet/studio/${p.studioId}?tab=overrides` },
              { id: "schedule", label: "Расписание", href: `/cabinet/studio/${p.studioId}?tab=schedule` },
              { id: "profile", label: "Профиль", href: `/cabinet/studio/${p.studioId}?tab=profile` },
            ]}
          />
          <Link
            href={`/providers/${provider.id}`}
            className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Открыть публичную страницу
          </Link>
        </div>

        <ProfileForm initialUser={meResponse.data.user} showProfessionalCta={false} />

        <section className="rounded-2xl border p-5">
          <h3 className="text-sm font-semibold">Дальше (следующий шаг)</h3>
          <p className="mt-2 text-sm text-neutral-600">
            Отдельно сделаем форму “Профиль студии” (название, адрес, район, описание,
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
        <CabinetNavTabs
          activeId="masters"
          items={[
            { id: "bookings", label: "Записи", href: `/cabinet/studio/${p.studioId}?tab=bookings` },
            { id: "masters", label: "Мастера", href: `/cabinet/studio/${p.studioId}?tab=masters` },
            { id: "services", label: "Услуги", href: `/cabinet/studio/${p.studioId}?tab=services` },
            { id: "overrides", label: "Исключения", href: `/cabinet/studio/${p.studioId}?tab=overrides` },
            { id: "schedule", label: "Расписание", href: `/cabinet/studio/${p.studioId}?tab=schedule` },
            { id: "profile", label: "Профиль", href: `/cabinet/studio/${p.studioId}?tab=profile` },
          ]}
        />

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
        <CabinetNavTabs
          activeId="services"
          items={[
            { id: "bookings", label: "Записи", href: `/cabinet/studio/${p.studioId}?tab=bookings` },
            { id: "masters", label: "Мастера", href: `/cabinet/studio/${p.studioId}?tab=masters` },
            { id: "services", label: "Услуги", href: `/cabinet/studio/${p.studioId}?tab=services` },
            { id: "overrides", label: "Исключения", href: `/cabinet/studio/${p.studioId}?tab=overrides` },
            { id: "schedule", label: "Расписание", href: `/cabinet/studio/${p.studioId}?tab=schedule` },
            { id: "profile", label: "Профиль", href: `/cabinet/studio/${p.studioId}?tab=profile` },
          ]}
        />

        <StudioServicesPanel studioId={provider.id} />
      </CabinetShell>
    );
  }

  if (tab === "overrides") {
    return (
      <CabinetShell
        title="Кабинет студии"
        subtitle="Настройте исключения и перерывы."
      >
        <CabinetNavTabs
          activeId="overrides"
          items={[
            { id: "bookings", label: "Записи", href: `/cabinet/studio/${p.studioId}?tab=bookings` },
            { id: "masters", label: "Мастера", href: `/cabinet/studio/${p.studioId}?tab=masters` },
            { id: "services", label: "Услуги", href: `/cabinet/studio/${p.studioId}?tab=services` },
            { id: "overrides", label: "Исключения", href: `/cabinet/studio/${p.studioId}?tab=overrides` },
            { id: "schedule", label: "Расписание", href: `/cabinet/studio/${p.studioId}?tab=schedule` },
            { id: "profile", label: "Профиль", href: `/cabinet/studio/${p.studioId}?tab=profile` },
          ]}
        />

        <StudioOverridesPanel studioId={provider.id} />
      </CabinetShell>
    );
  }

  if (tab === "schedule") {
    return (
      <CabinetShell
        title="Кабинет студии"
        subtitle="Настройте недельное расписание."
      >
        <CabinetNavTabs
          activeId="schedule"
          items={[
            { id: "bookings", label: "Записи", href: `/cabinet/studio/${p.studioId}?tab=bookings` },
            { id: "masters", label: "Мастера", href: `/cabinet/studio/${p.studioId}?tab=masters` },
            { id: "services", label: "Услуги", href: `/cabinet/studio/${p.studioId}?tab=services` },
            { id: "overrides", label: "Исключения", href: `/cabinet/studio/${p.studioId}?tab=overrides` },
            { id: "schedule", label: "Расписание", href: `/cabinet/studio/${p.studioId}?tab=schedule` },
            { id: "profile", label: "Профиль", href: `/cabinet/studio/${p.studioId}?tab=profile` },
          ]}
        />

        <StudioSchedulePanel studioId={provider.id} />
      </CabinetShell>
    );
  }

  return (
    <CabinetShell
      title="Кабинет студии"
      subtitle="Управляйте записями и профилем студии."
    >
      <div className="flex items-center justify-between gap-3">
        <CabinetNavTabs
          activeId="bookings"
          items={[
            { id: "bookings", label: "Записи", href: `/cabinet/studio/${p.studioId}?tab=bookings` },
            { id: "masters", label: "Мастера", href: `/cabinet/studio/${p.studioId}?tab=masters` },
            { id: "services", label: "Услуги", href: `/cabinet/studio/${p.studioId}?tab=services` },
            { id: "overrides", label: "Исключения", href: `/cabinet/studio/${p.studioId}?tab=overrides` },
            { id: "schedule", label: "Расписание", href: `/cabinet/studio/${p.studioId}?tab=schedule` },
            { id: "profile", label: "Профиль", href: `/cabinet/studio/${p.studioId}?tab=profile` },
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
          <ProviderBookingsPanel endpoint={`/api/bookings?providerId=${provider.id}`} />
        </div>
      </section>
    </CabinetShell>
  );
}