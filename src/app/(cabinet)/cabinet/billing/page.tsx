import { AccountType } from "@prisma/client";
import { redirect } from "next/navigation";
import { BillingPage } from "@/features/billing/components/billing-page";
import { MasterCabinetShell } from "@/features/master/components/master-cabinet-shell";
import { StudioNavbar } from "@/features/studio-cabinet/components/studio-navbar";
import { hasMasterProfile } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { hasStudioAdminAccess } from "@/lib/auth/studio-guards";
import { getCurrentMasterProviderContext } from "@/lib/master/access";
import { prisma } from "@/lib/prisma";
import { providerPublicUrl } from "@/lib/public-urls";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import * as UI_TEXT from "@/lib/ui/text";

export const runtime = "nodejs";

type PageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const params = searchParams instanceof Promise ? await searchParams : searchParams ?? {};
  const rawScope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  const requestedScope = rawScope === "MASTER" || rawScope === "STUDIO" ? rawScope : null;

  const hasMaster = user.roles.includes(AccountType.MASTER);
  const hasStudio = user.roles.includes(AccountType.STUDIO) || user.roles.includes(AccountType.STUDIO_ADMIN);

  // FIX-26 (PLAN-GATE-CTA-BROKEN): a scope-less /cabinet/billing visit — e.g. a
  // billing-event notification deep-link — used to dead-end at /cabinet/profile.
  // Resolve it to the user's own billing by role instead. Gate CTAs are now
  // scope-explicit (billingUpgradeHref), so a both-provider-roles user only
  // reaches here scope-less from non-gate links; pick MASTER deterministically.
  // A client-only user (no provider role) still belongs on /cabinet/profile.
  const scope = requestedScope ?? (hasMaster ? "MASTER" : hasStudio ? "STUDIO" : null);

  if (!scope) {
    redirect("/cabinet/profile");
  }

  if (scope === "MASTER" && !hasMaster) {
    redirect("/cabinet/profile");
  }
  if (scope === "STUDIO" && !hasStudio) {
    redirect("/cabinet/profile");
  }

  if (scope === "MASTER") {
    const hasProfile = await hasMasterProfile(user.id);
    if (!hasProfile) {
      redirect("/403");
    }

    // PERF-24: `getCurrentMasterProviderContext` уже возвращает `{id, studioId}`
    // и бросает 403, если кабинета нет, — повторное чтение той же строки за
    // тем же `studioId` было третьим последовательным round-trip'ом ни за чем.
    // Соседние `hasMasterProfile`/`getCurrentMasterProviderContext` намеренно
    // остаются последовательными: это цепочка гвардов, и её порядок — часть
    // смысла (без мастерского профиля пользователь уходит на /403, а не в
    // ошибку из второго резолвера).
    const masterContext = await getCurrentMasterProviderContext(user.id);

    // FIX-VISUAL-POLISH G7: render inside the master cabinet shell (sidebar +
    // bottom-nav) so billing is consistent with the other /cabinet/master/*
    // pages instead of the previous bare full-width section.
    return (
      <MasterCabinetShell userId={user.id}>
        <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 lg:px-8">
          {masterContext.studioId ? (
            <section className="space-y-4">
              <div className="lux-card rounded-[24px] p-6">
                <h1 className="text-2xl font-semibold text-text-main">Тариф управляется студией</h1>
                <p className="mt-2 text-sm text-text-sec">
                  Вы работаете в составе студии, поэтому управление тарифом выполняет студия.
                  Обратитесь к администратору студии, если нужно изменить тариф.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href="/cabinet/master/dashboard"
                    className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Вернуться в кабинет
                  </a>
                  <a
                    href="/cabinet/master/profile"
                    className="inline-flex items-center rounded-xl border border-border-subtle px-4 py-2 text-sm font-medium text-text-main transition-colors hover:bg-bg-input"
                  >
                    Открыть профиль
                  </a>
                </div>
              </div>
            </section>
          ) : (
            <BillingPage scope="MASTER" />
          )}
        </div>
      </MasterCabinetShell>
    );
  }

  const hasStudioAccess = await hasStudioAdminAccess(user.id);
  if (!hasStudioAccess) {
    redirect("/403");
  }

  let providerId: string;
  try {
    ({ providerId } = await resolveCurrentStudioAccess(user.id));
  } catch {
    redirect("/403");
  }

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, name: true, publicUsername: true },
  });

  const studioName = provider?.name ?? UI_TEXT.studioCabinet.layout.studioFallbackName;
  const publicHref = provider?.publicUsername
    ? providerPublicUrl({ id: provider.id, publicUsername: provider.publicUsername }, "studio-cabinet") ?? "/cabinet/studio/settings"
    : "/cabinet/studio/settings";
  const publicHint = provider?.publicUsername ? null : UI_TEXT.studioCabinet.layout.publicUsernameHint;

  return (
    <div className="min-h-dvh bg-bg-page">
      <StudioNavbar studioName={studioName} publicHref={publicHref} publicHint={publicHint} />
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6">
        <BillingPage scope="STUDIO" />
      </div>
    </div>
  );
}
