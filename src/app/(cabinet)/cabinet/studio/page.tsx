import Link from "next/link";
import { redirect } from "next/navigation";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { CabinetShell } from "@/features/cabinet/components/cabinet-shell";
import { CabinetNavTabs } from "@/features/cabinet/components/cabinet-nav-tabs";
import { StudioMastersPanel } from "@/features/cabinet/components/studio-masters-panel";
import { StudioServicesPanel } from "@/features/cabinet/components/studio-services-panel";
import { StudioOverridesPanel } from "@/features/cabinet/components/studio-overrides-panel";
import { StudioSchedulePanel } from "@/features/cabinet/components/studio-schedule-panel";
import { ProviderBookingsPanel } from "@/features/cabinet/components/provider-bookings-panel";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { MembershipStatus } from "@prisma/client";
import { StudioProfileCard } from "@/features/cabinet/components/studio-profile-card";

type SearchParams = { tab?: string };

export default async function StudioCabinetPage(props: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const sp =
    props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;

  const memberships = await prisma.studioMembership.findMany({
    where: { userId: user.id, status: MembershipStatus.ACTIVE },
    select: {
      studioId: true,
      roles: true,
      studio: {
        select: {
          provider: {
            select: { id: true, name: true, tagline: true },
          },
        },
      },
    },
  });

  if (memberships.length === 1) {
    return redirect(`/cabinet/studio/${memberships[0].studioId}`);
  }

  if (memberships.length > 1) {
    return (
      <CabinetShell title="Мои студии" subtitle="Выберите студию, чтобы перейти в кабинет.">
        <div className="grid gap-3 md:grid-cols-2">
          {memberships.map((membership) => (
            <Link
              key={membership.studioId}
              href={`/cabinet/studio/${membership.studioId}`}
              className="rounded-2xl border p-4 transition hover:bg-neutral-50"
            >
              <div className="text-sm text-neutral-500">Студия</div>
              <div className="mt-1 text-lg font-semibold">
                {membership.studio.provider.name}
              </div>
              <div className="mt-1 text-sm text-neutral-600">
                {membership.studio.provider.tagline}
              </div>
              <div className="mt-3 text-xs text-neutral-500">
                Роли: {membership.roles.join(", ")}
              </div>
            </Link>
          ))}
        </div>
      </CabinetShell>
    );
  }

  return renderLegacyStudioCabinet(sp);
}

async function renderLegacyStudioCabinet(sp?: SearchParams) {
  const tab =
    sp?.tab === "profile" ||
    sp?.tab === "masters" ||
    sp?.tab === "services" ||
    sp?.tab === "overrides" ||
    sp?.tab === "schedule"
      ? sp.tab
      : "bookings";

  const providerResponse = await serverApiFetch<{ provider: ProviderProfileDto | null }>(
    "/api/providers/me?type=STUDIO"
  );

  if (!providerResponse.ok) {
    if (providerResponse.error.code === "UNAUTHORIZED") redirect("/login");
    if (providerResponse.error.code === "FORBIDDEN_ROLE") redirect("/403");

    return (
      <CabinetShell title="Кабинет студии" subtitle="Ошибка загрузки данных профиля.">
        <div className="rounded-2xl border p-6 text-red-600">
          Ошибка сервера: {providerResponse.error.message}
        </div>
      </CabinetShell>
    );
  }

  const provider = providerResponse.data.provider;

  if (!provider) {
    return (
      <CabinetShell title="Кабинет студии" subtitle="Создайте профиль студии, чтобы принимать записи.">
        <div className="rounded-2xl border p-6">
          <p className="text-neutral-700">
            У вас пока нет профиля провайдера. Создайте профиль студии, чтобы начать
            принимать записи.
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

  if (provider.type !== "STUDIO") {
    redirect("/cabinet/master");
  }

  if (tab === "profile") {
    return (
      <CabinetShell
        title="Кабинет студии"
        subtitle="Информация о студии."
        right={
          <Link
            href={`/providers/${provider.id}`}
            className="rounded-xl border px-3 py-2 text-sm font-medium whitespace-nowrap hover:bg-neutral-50"
          >
            Публичная страница
          </Link>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CabinetNavTabs
              activeId="profile"
              items={[
                { id: "bookings", label: "Записи", href: "/cabinet/studio?tab=bookings" },
                { id: "masters", label: "Мастера", href: "/cabinet/studio?tab=masters" },
                { id: "services", label: "Услуги", href: "/cabinet/studio?tab=services" },
                { id: "overrides", label: "Настройки", href: "/cabinet/studio?tab=overrides" },
                { id: "schedule", label: "Расписание", href: "/cabinet/studio?tab=schedule" },
                { id: "profile", label: "Профиль", href: "/cabinet/studio?tab=profile" },
              ]}
            />
          </div>
        </div>

        <StudioProfileCard provider={provider} studioId={provider.id} canEdit />
      </CabinetShell>
    );
  }

  if (tab === "masters") {
    return (
      <CabinetShell title="Кабинет студии" subtitle="Управляйте мастерами студии.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CabinetNavTabs
              activeId="masters"
              items={[
                { id: "bookings", label: "Записи", href: "/cabinet/studio?tab=bookings" },
                { id: "masters", label: "Мастера", href: "/cabinet/studio?tab=masters" },
                { id: "services", label: "Услуги", href: "/cabinet/studio?tab=services" },
                { id: "overrides", label: "Настройки", href: "/cabinet/studio?tab=overrides" },
                { id: "schedule", label: "Расписание", href: "/cabinet/studio?tab=schedule" },
                { id: "profile", label: "Профиль", href: "/cabinet/studio?tab=profile" },
              ]}
            />
          </div>
        </div>

        <StudioMastersPanel studioId={provider.id} />
      </CabinetShell>
    );
  }

  if (tab === "services") {
    return (
      <CabinetShell title="Кабинет студии" subtitle="Управляйте каталогом услуг студии.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CabinetNavTabs
              activeId="services"
              items={[
                { id: "bookings", label: "Записи", href: "/cabinet/studio?tab=bookings" },
                { id: "masters", label: "Мастера", href: "/cabinet/studio?tab=masters" },
                { id: "services", label: "Услуги", href: "/cabinet/studio?tab=services" },
                { id: "overrides", label: "Настройки", href: "/cabinet/studio?tab=overrides" },
                { id: "schedule", label: "Расписание", href: "/cabinet/studio?tab=schedule" },
                { id: "profile", label: "Профиль", href: "/cabinet/studio?tab=profile" },
              ]}
            />
          </div>
        </div>

        <StudioServicesPanel studioId={provider.id} />
      </CabinetShell>
    );
  }

  if (tab === "overrides") {
    return (
      <CabinetShell title="Кабинет студии" subtitle="Настройки услуг для мастеров.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CabinetNavTabs
              activeId="overrides"
              items={[
                { id: "bookings", label: "Записи", href: "/cabinet/studio?tab=bookings" },
                { id: "masters", label: "Мастера", href: "/cabinet/studio?tab=masters" },
                { id: "services", label: "Услуги", href: "/cabinet/studio?tab=services" },
                { id: "overrides", label: "Настройки", href: "/cabinet/studio?tab=overrides" },
                { id: "schedule", label: "Расписание", href: "/cabinet/studio?tab=schedule" },
                { id: "profile", label: "Профиль", href: "/cabinet/studio?tab=profile" },
              ]}
            />
          </div>
        </div>

        <StudioOverridesPanel studioId={provider.id} />
      </CabinetShell>
    );
  }

  if (tab === "schedule") {
    return (
      <CabinetShell title="Кабинет студии" subtitle="Расписание мастеров студии.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CabinetNavTabs
              activeId="schedule"
              items={[
                { id: "bookings", label: "Записи", href: "/cabinet/studio?tab=bookings" },
                { id: "masters", label: "Мастера", href: "/cabinet/studio?tab=masters" },
                { id: "services", label: "Услуги", href: "/cabinet/studio?tab=services" },
                { id: "overrides", label: "Настройки", href: "/cabinet/studio?tab=overrides" },
                { id: "schedule", label: "Расписание", href: "/cabinet/studio?tab=schedule" },
                { id: "profile", label: "Профиль", href: "/cabinet/studio?tab=profile" },
              ]}
            />
          </div>
        </div>

        <StudioSchedulePanel studioId={provider.id} />
      </CabinetShell>
    );
  }

  return (
    <CabinetShell
      title="Кабинет студии"
      subtitle="Управляйте записями и профилем студии."
      right={
        <Link
          href={`/providers/${provider.id}`}
          className="rounded-xl border px-3 py-2 text-sm font-medium whitespace-nowrap hover:bg-neutral-50"
        >
          Публичная страница
        </Link>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CabinetNavTabs
            activeId="bookings"
            items={[
              { id: "bookings", label: "Записи", href: "/cabinet/studio?tab=bookings" },
              { id: "masters", label: "Мастера", href: "/cabinet/studio?tab=masters" },
              { id: "services", label: "Услуги", href: "/cabinet/studio?tab=services" },
              { id: "overrides", label: "Настройки", href: "/cabinet/studio?tab=overrides" },
              { id: "schedule", label: "Расписание", href: "/cabinet/studio?tab=schedule" },
              { id: "profile", label: "Профиль", href: "/cabinet/studio?tab=profile" },
            ]}
          />
        </div>
      </div>

      <section className="rounded-2xl border p-5">
        <div>
          <h2 className="text-lg font-semibold">Записи студии</h2>
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
